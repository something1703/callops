import os
import re
import urllib.parse
import json
import io
import logging
import boto3
import pandas as pd
import requests

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Configuration helpers
def get_backend_url():
    return os.environ.get("BACKEND_URL", "http://localhost:4000")

def get_service_secret():
    return os.environ.get("SERVICE_TO_SERVICE_SECRET", "")

def get_default_country_code():
    return os.environ.get("DEFAULT_COUNTRY_CODE", "+91")

def clean_phone(phone_str):
    if not isinstance(phone_str, str):
        phone_str = str(phone_str)
    
    # Strip spaces and formatting
    cleaned = re.sub(r"[^\d+]", "", phone_str)
    
    # Check if empty
    if not cleaned:
        return None
        
    # If it starts with +, keep it as is (assuming valid country code)
    if cleaned.startswith("+"):
        return cleaned
        
    # If it starts with 00, replace with +
    if cleaned.startswith("00"):
        return "+" + cleaned[2:]
        
    # If 10 digits, prefix default country code
    if len(cleaned) == 10:
        return get_default_country_code() + cleaned
        
    # If 12 digits and starts with 91 (for India), prefix +
    if len(cleaned) == 12 and cleaned.startswith("91"):
        return "+" + cleaned
        
    # Standard format: fallback to prefixing + if no plus exists
    return "+" + cleaned

def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")
    
    s3_client = boto3.client("s3")
    
    try:
        # Extract bucket and key from the event
        bucket = event["Records"][0]["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(event["Records"][0]["s3"]["object"]["key"], encoding="utf-8")
        
        # Parse batch_id from the key: uploads/<batch_id>/<filename>
        parts = key.split("/")
        if len(parts) < 3 or parts[0] != "uploads":
            raise ValueError(f"Invalid S3 key format: {key}. Expected uploads/<batch_id>/<filename>")
            
        batch_id = parts[1]
        logger.info(f"Processing batch ID: {batch_id} from s3://{bucket}/{key}")
        
        # Retrieve the CSV object from S3
        response = s3_client.get_object(Bucket=bucket, Key=key)
        csv_bytes = response["Body"].read()
        
        # Parse CSV with pandas
        # Use StringIO/BytesIO to load into pandas
        try:
            df = pd.read_csv(io.BytesIO(csv_bytes), dtype=str)
        except Exception as e:
            raise ValueError(f"Failed to parse CSV format: {str(e)}")
            
        logger.info(f"Successfully loaded CSV. Raw row count: {len(df)}")
        
        # Identify relevant columns case-insensitively
        columns = {col.lower().replace(" ", "_").replace("-", "_"): col for col in df.columns}
        
        name_col = next((columns[c] for c in ["full_name", "fullname", "name"] if c in columns), None)
        phone_col = next((columns[c] for c in ["phone_number", "phone", "phonenumber", "mobile"] if c in columns), None)
        region_col = next((columns[c] for c in ["region", "state", "city"] if c in columns), None)
        tags_col = next((columns[c] for c in ["tags", "tag", "category"] if c in columns), None)
        
        if not name_col or not phone_col:
            raise ValueError(f"CSV must contain at least 'Name' and 'Phone' columns. Found: {list(df.columns)}")
            
        cleaned_rows = []
        seen_phones = set()
        
        for idx, row in df.iterrows():
            raw_name = row[name_col]
            raw_phone = row[phone_col]
            
            # Basic validation
            if pd.isna(raw_name) or not str(raw_name).strip():
                logger.warning(f"Row {idx}: missing name, skipping")
                continue
                
            if pd.isna(raw_phone) or not str(raw_phone).strip():
                logger.warning(f"Row {idx}: missing phone number, skipping")
                continue
                
            name = str(raw_name).strip()[:500]
            phone = clean_phone(str(raw_phone).strip())
            
            if not phone or len(phone) < 5 or len(phone) > 30:
                logger.warning(f"Row {idx}: normalized phone number '{phone}' invalid length (must be 5-30 chars), skipping")
                continue
                
            # Local deduplication in this batch
            if phone in seen_phones:
                logger.warning(f"Row {idx}: duplicate phone number '{phone}' in CSV, skipping")
                continue
            seen_phones.add(phone)
            
            # Region
            region = None
            if region_col and not pd.isna(row[region_col]):
                region = str(row[region_col]).strip()[:200]
                
            # Tags
            tags = []
            if tags_col and not pd.isna(row[tags_col]):
                raw_tags = str(row[tags_col]).strip()
                if raw_tags:
                    # Handle comma-separated list
                    tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
                    
            cleaned_rows.append({
                "full_name": name,
                "phone_number": phone,
                "region": region,
                "tags": tags
            })
            
        total_cleaned = len(cleaned_rows)
        logger.info(f"Data cleaning finished. Cleaned row count: {total_cleaned}")
        
        if total_cleaned == 0:
            raise ValueError("No valid contacts found in the uploaded CSV after cleaning.")
            
        # Batch upload to Fastify backend (chunk size = 500)
        chunk_size = 500
        headers = {
            "Content-Type": "application/json",
            "x-service-secret": get_service_secret()
        }
        
        for i in range(0, total_cleaned, chunk_size):
            chunk = cleaned_rows[i:i + chunk_size]
            is_final = (i + chunk_size >= total_cleaned)
            
            payload = {
                "batch_id": batch_id,
                "rows": chunk,
                "is_final": is_final,
                "total_row_count": total_cleaned if is_final else None
            }
            
            url = f"{get_backend_url()}/internal/ingest"
            logger.info(f"POSTing chunk to {url} (size={len(chunk)}, is_final={is_final})")
            
            res = requests.post(url, headers=headers, json=payload)
            if res.status_code != 200:
                raise RuntimeError(f"Backend ingestion error ({res.status_code}): {res.text}")
                
        logger.info("Ingestion completed successfully.")
        return {"statusCode": 200, "body": json.dumps({"message": "Ingestion successful", "contacts_ingested": total_cleaned})}
        
    except Exception as e:
        logger.error(f"Error processing CSV: {str(e)}")
        # Call failure endpoint if batch_id can be parsed
        try:
            parts = key.split("/")
            batch_id = parts[1]
            fail_url = f"{get_backend_url()}/internal/ingest/fail"
            requests.patch(fail_url, headers={
                "Content-Type": "application/json",
                "x-service-secret": get_service_secret()
            }, json={
                "batch_id": batch_id,
                "reason": str(e)
            })
            logger.info(f"Successfully notified backend of failure for batch: {batch_id}")
        except Exception as fe:
            logger.error(f"Failed to notify backend of failure: {str(fe)}")
            
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
