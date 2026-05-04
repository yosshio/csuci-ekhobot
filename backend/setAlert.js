#!/usr/bin/env node
/*
================================================================================
EKHOBOT ALERT SETTER
================================================================================
Quick script to set or clear campus alerts

Usage:
  node setAlert.js "Campus power outage"
  node setAlert.js clear
  node setAlert.js ""

This sets the alert banner that appears at the top of the EkhoBot chat window
================================================================================
*/

import 'dotenv/config';

const BACKEND_URL = 'http://localhost:3000/alert';
const ALERT_KEY = process.env.ALERT_KEY || 'ekhobot2026';

// Get alert message from command line argument
const message = process.argv[2];

if (!message && message !== '') {
  console.log('Usage: node setAlert.js "Your alert message here"');
  console.log('       node setAlert.js clear');
  console.log('');
  console.log('Examples:');
  console.log('  node setAlert.js "Campus power outage — some services unavailable"');
  console.log('  node setAlert.js "Weather alert: Campus closed today"');
  console.log('  node setAlert.js clear');
  process.exit(1);
}

// Allow "clear" as shorthand for empty message
const alertMessage = message.toLowerCase() === 'clear' ? '' : message;

// Send alert to backend
async function setAlert() {
  try {
    console.log(alertMessage ? `Setting alert: "${alertMessage}"` : 'Clearing alert...');
    
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: alertMessage,
        key: ALERT_KEY
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (alertMessage) {
      console.log('✓ Alert set successfully!');
      console.log(`  Active alert: "${data.alert}"`);
    } else {
      console.log('✓ Alert cleared successfully!');
    }
    
  } catch (error) {
    console.error('✗ Failed to set alert:', error.message);
    console.error('  Make sure the backend server is running (node server.js)');
    process.exit(1);
  }
}

setAlert();
