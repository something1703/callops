import os
import sys
import uuid
import boto3
from ingest_clean import lambda_handler

def load_env():
    # Load .env from project root
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(root_dir, ".env")
    if os.path.exists(env_path):
        print(f"Loading environment from {env_path}")
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key.strip()] = value.strip()
    
    # Load backend/.env to overlay S3_BUCKET and other variables
    backend_env = os.path.join(root_dir, "backend", ".env")
    if os.path.exists(backend_env):
        print(f"Loading environment from {backend_env}")
        with open(backend_env, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, value = line.split("=", 1)
                    # Don't overwrite unless empty
                    v = value.strip()
                    k = key.strip()
                    if k not in os.environ or not os.environ[k]:
                        os.environ[k] = v

def simulate_upload_and_ingest(csv_filepath, batch_id=None):
    load_env()
    
    bucket_name = os.environ.get("S3_BUCKET", "callops-data-lake-rvsr")
    region = os.environ.get("AWS_REGION", "ap-south-1")
    
    if not os.path.exists(csv_filepath):
        print(f"Error: CSV file not found at {csv_filepath}")
        sys.exit(1)
        
    filename = os.path.basename(csv_filepath)
    if not batch_id:
        batch_id = str(uuid.uuid4())
    s3_key = f"uploads/{batch_id}/{filename}"
    
    print(f"Uploading {csv_filepath} to s3://{bucket_name}/{s3_key} in {region}...")
    
    # Upload to S3
    s3_client = boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY")
    )
    
    s3_client.upload_file(csv_filepath, bucket_name, s3_key)
    print("Upload complete. Simulating S3 trigger...")
    
    # Simulate S3 event structure
    event = {
        "Records": [
            {
                "s3": {
                    "bucket": {
                        "name": bucket_name
                    },
                    "object": {
                        "key": s3_key
                    }
                }
            }
        ]
    }
    
    # Call the ETL handler
    result = lambda_handler(event, None)
    print(f"Execution finished with result: {result}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python simulate.py <path_to_csv> [batch_id]")
        sys.exit(1)
        
    bid = sys.argv[2] if len(sys.argv) > 2 else None
    simulate_upload_and_ingest(sys.argv[1], bid)
