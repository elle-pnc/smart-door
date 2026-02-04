# Smart Door Dashboard (ESP32 + HiveMQ Cloud)

This is a simple web dashboard that connects to HiveMQ Cloud over MQTT (WebSockets) and shows door status + history in GMT+8.

## 1) HiveMQ Cloud setup
1. Create a free cluster in HiveMQ Cloud.
2. Create credentials (username + password).
3. Note your cluster host, for example: `abcd1234.s1.eu.hivemq.cloud`.
4. Ensure WebSockets are enabled (HiveMQ Cloud uses secure WebSockets).

Most HiveMQ Cloud clusters use:
- Host: `<cluster>.s1.eu.hivemq.cloud`
- Port: `8884`
- WebSocket path: `/mqtt`

## 2) ESP32 firmware (publish door status)
You can publish simple payloads like `open` and `close` to a topic.

Suggested topic:
```
smartdoor/status
```

Minimal Arduino-style example (adjust WiFi + credentials):
```cpp
#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid = "YOUR_WIFI";
const char* pass = "YOUR_WIFI_PASSWORD";
const char* host = "YOUR_CLUSTER.s1.eu.hivemq.cloud";
const int port = 8883; // MQTT over TLS
const char* user = "HIVEMQ_USERNAME";
const char* password = "HIVEMQ_PASSWORD";
const char* topic = "smartdoor/status";

WiFiClientSecure tlsClient;
PubSubClient mqtt(tlsClient);

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, pass);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  tlsClient.setInsecure(); // For quick testing only. Use proper certs in production.
  mqtt.setServer(host, port);
  mqtt.connect("esp32-door", user, password);
}

void loop() {
  // Example: publish "open" or "close" when your sensor changes.
  mqtt.publish(topic, "open");
  delay(5000);
}
```

## 3) Web dashboard setup
Open `index.html` in a browser.

In the UI, enter:
- Host
- Port (usually `8884`)
- Topic (same as the ESP32 publish topic)
- Username + Password

Click **Connect**.

## Notes
- The dashboard stores history in your browser (localStorage).
- Timezone is fixed to GMT+8 (Asia/Singapore).
