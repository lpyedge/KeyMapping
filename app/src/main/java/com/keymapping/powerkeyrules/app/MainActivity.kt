package com.keymapping.powerkeyrules.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import com.keymapping.powerkeyrules.R

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val textPath = findViewById<TextView>(R.id.text_path)
        textPath.text = RuleConfigWriter.rulesFilePath(this)

        findViewById<Button>(R.id.button_write_default).setOnClickListener {
            RuleConfigWriter.writeDefault(this)
        }

        findViewById<Button>(R.id.button_open_webui).setOnClickListener {
            startActivity(Intent(this, WebUiActivity::class.java))
        }
    }
}

