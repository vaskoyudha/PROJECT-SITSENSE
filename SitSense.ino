/*
 * ESP32 Kursi Pintar - MQTT Version
 * Super Fast Real-time Monitoring!
 * 
 * Hardware: FSR + 2x Ultrasonic (Punggung & Leher)
 * Protocol: MQTT (10-50ms latency!)
 * 
 * INSTALL LIBRARY:
 * 1. Arduino IDE → Tools → Manage Libraries
 * 2. Cari "PubSubClient" by Nick O'Leary
 * 3. Install
 */

#include <WiFi.h>
#include <PubSubClient.h>

// ============ WIFI CONFIG ============
#define WIFI_SSID       "wifi rahma"
#define WIFI_PASSWORD   "gataudeh"

// ============ MQTT CONFIG ============
// MQTT Broker (pilih salah satu):

// Option 1: Mosquitto Public (More Reliable)
#define MQTT_SERVER     "test.mosquitto.org"
#define MQTT_PORT       1883

// Option 2: HiveMQ Public
// #define MQTT_SERVER     "broker.hivemq.com"
// #define MQTT_PORT       1883

// Option 3: EMQX Public
// #define MQTT_SERVER     "broker.emqx.io"
// #define MQTT_PORT       1883

// MQTT Topics
String mqttClientId;
#define TOPIC_DATA      "kursi/data/"       // + clientId
#define TOPIC_STATUS    "kursi/status/"     // + clientId
#define TOPIC_CMD       "kursi/cmd/"        // + clientId
#define TOPIC_HEARTBEAT "kursi/heartbeat/"  // + clientId

// ============ PIN DEFINITIONS ============
#define FORCE_SENSOR_PIN 36   // FSR

// Ultrasonic Punggung
#define TRIG_PIN_BACK 23
#define ECHO_PIN_BACK 22

// Ultrasonic Leher
#define TRIG_PIN_NECK 16
#define ECHO_PIN_NECK 17

#define SOUND_SPEED 0.034

// ============ GLOBAL VARIABLES ============
WiFiClient espClient;
PubSubClient mqtt(espClient);

unsigned long lastSend = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastReconnect = 0;

// Intervals (dalam ms)
const unsigned long sendInterval = 100;      // 10x per detik
const unsigned long heartbeatInterval = 5000; 

// Sensor readings
int fsrValue = 0;
float distanceBack = 0.0f;
float distanceNeck = 0.0f;

// Statistics
unsigned long messageCount = 0;
unsigned long lastStatsTime = 0;

// Buffers for MQTT messages (Avoids String fragmentation)
char msgBuffer[256];
char topicBuffer[64];

// ============ FUNCTION PROTOTYPES ============
void connectWiFi();
void connectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
float readUltrasonic(int trigPin, int echoPin);
String getChipID();
void sendSensorData();
void sendHeartbeat();

// ============ SETUP ============
void setup() {
  Serial.begin(115200);
  delay(100);
  
  // WDT timeout 
  // esp_task_wdt_init(30, true); // Uncomment if WDT issues persist
  
  Serial.println("\n\n======================================");
  Serial.println("   ESP32 Kursi Pintar - MQTT Mode");
  Serial.println("======================================\n");
  
  // Setup ADC
  analogSetAttenuation(ADC_11db);
  
  // Setup Ultrasonic Pins
  pinMode(TRIG_PIN_BACK, OUTPUT);
  pinMode(ECHO_PIN_BACK, INPUT);
  pinMode(TRIG_PIN_NECK, OUTPUT);
  pinMode(ECHO_PIN_NECK, INPUT);
  
  // Generate unique client ID
  mqttClientId = "ESP32_Kursi_" + getChipID();
  Serial.print("Client ID: ");
  Serial.println(mqttClientId);
  Serial.println();
  
  // Connect WiFi
  connectWiFi();
  
  // Setup MQTT
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setKeepAlive(60);
  mqtt.setSocketTimeout(5);
  mqtt.setBufferSize(512); // Increase buffer size
  
  // Connect MQTT
  connectMQTT();
  
  Serial.println("\n✅ System Ready!");
  lastStatsTime = millis();
}

// ============ MAIN LOOP ============
void loop() {
  unsigned long now = millis();
  
  // Maintain MQTT Connection (Non-blocking)
  if (!mqtt.connected()) {
    if (now - lastReconnect > 5000) {
      lastReconnect = now;
      // Only attempt MQTT reconnect if WiFi is up
      // WiFi auto-reconnects in background, no need to call blocking reconnect()
      if (WiFi.status() == WL_CONNECTED) {
        connectMQTT();
      }
    }
  } else {
    mqtt.loop();
  }
  
  // ═══ READ SENSORS ═══
  fsrValue = analogRead(FORCE_SENSOR_PIN);
  distanceBack = readUltrasonic(TRIG_PIN_BACK, ECHO_PIN_BACK);
  delayMicroseconds(100);
  distanceNeck = readUltrasonic(TRIG_PIN_NECK, ECHO_PIN_NECK);
  
  // ═══ SEND TO MQTT ═══
  if (mqtt.connected() && (now - lastSend >= sendInterval)) {
    lastSend = now;
    sendSensorData();
    messageCount++; // Track successful sends
  }
  
  // ═══ PRINT TO SERIAL (Always, 10x/sec) ═══
  // This runs even if MQTT is offline so you always see activity
  static unsigned long lastPrint = 0;
  if (now - lastPrint >= 100) {
    lastPrint = now;
    const char* status = mqtt.connected() ? "ON" : "OFF";
    Serial.printf("[%s] FSR: %4d | Back: %6.2f | Neck: %6.2f\n", 
                  status, fsrValue, distanceBack, distanceNeck);
  }
  
  // ═══ HEARTBEAT ═══
  if (mqtt.connected() && (now - lastHeartbeat >= heartbeatInterval)) {
    lastHeartbeat = now;
    sendHeartbeat();
  }
  
  delay(10); // Small delay for stability
}

// ============ FUNCTIONS ============

void connectWiFi() {
  Serial.print("🔌 Connecting to WiFi: ");
  Serial.print(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" ✅");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" ❌ WiFi Failed (Will retry in loop)");
  }
}

void connectMQTT() {
  Serial.print("🔗 Connecting MQTT...");
  
  // Create Last Will and Testament
  String statusTopic = String(TOPIC_STATUS) + mqttClientId;
  
  if (mqtt.connect(mqttClientId.c_str(), statusTopic.c_str(), 0, true, "offline")) {
    Serial.println(" ✅");
    mqtt.publish(statusTopic.c_str(), "online", true);
    
    String cmdTopic = String(TOPIC_CMD) + mqttClientId;
    mqtt.subscribe(cmdTopic.c_str());
  } else {
    Serial.print(" ❌ Failed rc=");
    Serial.println(mqtt.state());
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Use buffer to safe parse
  if (length >= sizeof(msgBuffer)) length = sizeof(msgBuffer) - 1;
  memcpy(msgBuffer, payload, length);
  msgBuffer[length] = '\0';
  
  String message = String(msgBuffer);
  Serial.printf("📨 Cmd: %s\n", msgBuffer);
  
  if (message == "reset") {
    ESP.restart();
  }
}

float readUltrasonic(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  
  long duration = pulseIn(echoPin, HIGH, 15000); // 15ms timeout
  if (duration == 0) return NAN;
  return duration * SOUND_SPEED / 2.0;
}

String getChipID() {
  uint64_t mac = ESP.getEfuseMac();
  char id[13];
  sprintf(id, "%012llX", mac);
  return String(id);
}

void sendSensorData() {
  // Use snprintf for safe buffer construction (No String objects)
  // Format: {"fsr":123,"back":12.3,"neck":45.6,"ts":123456789}
  
  snprintf(msgBuffer, sizeof(msgBuffer), 
    "{\"fsr\":%d,\"back\":%.2f,\"neck\":%.2f,\"ts\":%lu}", 
    fsrValue, 
    isnan(distanceBack) ? -1.0 : distanceBack, 
    isnan(distanceNeck) ? -1.0 : distanceNeck, 
    millis()
  );

  // Construct topic
  String topic = String(TOPIC_DATA) + mqttClientId;
  mqtt.publish(topic.c_str(), msgBuffer);
}

void sendHeartbeat() {
  snprintf(msgBuffer, sizeof(msgBuffer), 
    "{\"uptime\":%lu,\"rssi\":%d,\"ip\":\"%s\"}", 
    millis()/1000, 
    WiFi.RSSI(), 
    WiFi.localIP().toString().c_str()
  );
  
  String topic = String(TOPIC_HEARTBEAT) + mqttClientId;
  mqtt.publish(topic.c_str(), msgBuffer);
}