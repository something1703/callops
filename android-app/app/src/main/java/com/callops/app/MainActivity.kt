package com.callops.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.callops.app.data.TokenStore
import com.callops.app.navigation.CallOpsNavGraph
import com.callops.app.ui.theme.CallOpsTheme
import com.callops.app.ui.theme.Gray950

class MainActivity : ComponentActivity() {

    private lateinit var tokenStore: TokenStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        tokenStore = TokenStore(applicationContext)

        setContent {
            CallOpsTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Gray950,
                ) {
                    CallOpsNavGraph(tokenStore = tokenStore)
                }
            }
        }
    }
}
