#include <Arduino.h>
#include <WiFi.h>
#include "esp_http_server.h"
#include "lwip/sockets.h"
#include "camera_config.h"
#include "distance_detection.h"
#include "ble_service.h"

// Wi-Fi мэдээлэл (ESP32-CAM стрим цацахад локал IP ашиглана)
const char *ssid = "UNIVISION_99";
const char *password = "88873304Aa";

// HC-SR04 мэдрэгчийн пин холболтууд
const int trigPin = 13;
const int echoPin = 12;

// Stream сервер бариул
httpd_handle_t camera_httpd = NULL;
httpd_handle_t status_httpd = NULL;
static esp_err_t status_handler(httpd_req_t *req);
static portMUX_TYPE detectionMux = portMUX_INITIALIZER_UNLOCKED;
static const char *latestDecision = "WAITING";
static int latestDistanceCm = -1;
static uint32_t latestUpdateMs = 0;
// Temporary diagnostic switch to measure Wi-Fi without Bluetooth coexistence.
static constexpr bool enableBle = false;

// Камерын стрим хэндлер (MJPEG формат)
static esp_err_t stream_handler(httpd_req_t *req)
{
    Serial.println("Stream: client connected");
    // MJPEG sends short boundaries/headers between images; do not buffer them
    // behind delayed TCP acknowledgements.
    const int noDelay = 1;
    const int socketFd = httpd_req_to_sockfd(req);
    if (setsockopt(socketFd, IPPROTO_TCP, TCP_NODELAY, &noDelay, sizeof(noDelay)) != 0)
        Serial.println("Stream: TCP_NODELAY unavailable");
    camera_fb_t *fb = NULL;
    esp_err_t res = ESP_OK;
    size_t _jpg_buf_len = 0;
    uint8_t *_jpg_buf = NULL;
    char part_buf[128];

    res = httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=123456789000000000000987654321");
    if (res != ESP_OK)
    {
        return res;
    }

    while (true)
    {
        fb = esp_camera_fb_get();
        if (!fb)
        {
            Serial.println("Camera capture failed");
            res = ESP_FAIL;
            break;
        }

        if (fb->format != PIXFORMAT_JPEG)
        {
            bool jpeg_converted = frame2jpg(fb, 80, &_jpg_buf, &_jpg_buf_len);
            esp_camera_fb_return(fb);
            fb = NULL;
            if (!jpeg_converted)
            {
                Serial.println("JPEG compression failed");
                res = ESP_FAIL;
                break;
            }
        }
        else
        {
            _jpg_buf = fb->buf;
            _jpg_buf_len = fb->len;
        }

        if (res == ESP_OK)
        {
            size_t hlen = snprintf(part_buf, sizeof(part_buf), "--123456789000000000000987654321\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", _jpg_buf_len);
            // Энд httpd_req_send-ийг httpd_resp_send болгов
            res = httpd_resp_send_chunk(req, part_buf, hlen);
        }
        if (res == ESP_OK)
        {
            res = httpd_resp_send_chunk(req, (char *)_jpg_buf, _jpg_buf_len);
        }
        if (res == ESP_OK)
        {
            res = httpd_resp_send_chunk(req, "\r\n", 2);
        }

        if (fb)
        {
            esp_camera_fb_return(fb);
            fb = NULL;
            _jpg_buf = NULL;
        }
        else if (_jpg_buf)
        {
            free(_jpg_buf);
            _jpg_buf = NULL;
        }

        if (res != ESP_OK)
        {
            break;
        }
    }
    return res;
}
// Стрийм серверийг эхлүүлэх функц
void startCameraServer()
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;

    httpd_uri_t stream_uri = {
        .uri = "/stream",
        .method = HTTP_GET,
        .handler = stream_handler,
        .user_ctx = NULL};

    if (httpd_start(&camera_httpd, &config) == ESP_OK)
    {
        httpd_register_uri_handler(camera_httpd, &stream_uri);
        Serial.println("Camera Stream Server Started Successfully!");
    }
}
static esp_err_t capture_handler(httpd_req_t *req)
{
    camera_fb_t *frame = esp_camera_fb_get();
    if (!frame) return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Camera unavailable");
    httpd_resp_set_type(req, "image/jpeg");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    const esp_err_t result = httpd_resp_send(req, (const char *)frame->buf, frame->len);
    esp_camera_fb_return(frame);
    return result;
}

void startStatusServer()
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 81;
    config.ctrl_port = 32769;

    httpd_uri_t status_uri = {};
    status_uri.uri = "/status";
    status_uri.method = HTTP_GET;
    status_uri.handler = status_handler;
    httpd_uri_t capture_uri = {};
    capture_uri.uri = "/capture";
    capture_uri.method = HTTP_GET;
    capture_uri.handler = capture_handler;

    if (httpd_start(&status_httpd, &config) == ESP_OK)
    {
        httpd_register_uri_handler(status_httpd, &status_uri);
        httpd_register_uri_handler(status_httpd, &capture_uri);
        Serial.println("Status server started on port 81");
    }
    else
    {
        Serial.println("Status server failed");
    }
}
// Зайг шалгах функц
float getUltrasonicDistance()
{
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    long duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout
    if (duration == 0)
    {
        return -1.0;
    }

    return duration * 0.034 / 2;
}
void updateDecision(const char *decision, int distanceCm)
{
    portENTER_CRITICAL(&detectionMux);
    latestDecision = decision;
    latestDistanceCm = distanceCm;
    latestUpdateMs = millis();
    portEXIT_CRITICAL(&detectionMux);
}
static esp_err_t status_handler(httpd_req_t *req)
{
    portENTER_CRITICAL(&detectionMux);
    const char *decision = latestDecision;
    const int distanceCm = latestDistanceCm;
    const uint32_t updatedMs = latestUpdateMs;
    portEXIT_CRITICAL(&detectionMux);
    const uint32_t ageMs = millis() - updatedMs;
    const bool stale = ageMs > 1500;
    if (stale) decision = "UNKNOWN";
    char distance[16] = "null";
    if (!stale && distanceCm >= 0)
        snprintf(distance, sizeof(distance), "%d", distanceCm);
    char json[128];
    snprintf(json, sizeof(json),
             "{\"decision\":\"%s\",\"distance_cm\":%s,\"age_ms\":%lu}",
             decision, distance, (unsigned long)ageMs);
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    return httpd_resp_send(req, json, HTTPD_RESP_USE_STRLEN);
}

void setup()
{
    Serial.begin(115200);

    WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info)
                 { Serial.printf("WiFi disconnected: reason=%u\n", info.wifi_sta_disconnected.reason); }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
    WiFi.mode(WIFI_STA);
    const int networks = WiFi.scanNetworks();
    bool foundNetwork = false;
    for (int i = 0; i < networks; ++i)
    {
        if (WiFi.SSID(i) == ssid)
        {
            foundNetwork = true;
            Serial.printf("WiFi target found: channel=%d RSSI=%d auth=%d\n",
                          WiFi.channel(i), WiFi.RSSI(i), (int)WiFi.encryptionType(i));
        }
    }
    if (!foundNetwork)
        Serial.printf("WiFi target not found (scan result=%d)\n", networks);
    WiFi.scanDelete();

    // Wi-Fi холболт үүсгэх (Стрийм явуулахад заавал шаардлагатай)
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED)
    {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi Connected!");
    Serial.print("Stream URL: http://");
    Serial.print(WiFi.localIP());
    Serial.println("/stream");

    // HC-SR04 пинүүдийг тохируулах
    pinMode(trigPin, OUTPUT);
    pinMode(echoPin, INPUT);

    if (!initCamera())
    {
        Serial.println("Camera init failed");
        while (true)
            delay(1000);
    }

    // BLE болон Камерын вэб стрим серверийг асаах
    if (enableBle)
        initBle();
    else
        WiFi.setSleep(false);
    startCameraServer();
    startStatusServer();
}

static DistanceDetection distanceDetection;

void loop()
{
    distanceDetection.update(getUltrasonicDistance());
    updateDecision(distanceDetection.decision, distanceDetection.distanceCm);
    static const char *previous = nullptr;
    if (previous != distanceDetection.decision)
    {
        Serial.printf("Detection: %s; distance: %d cm\n",
                      distanceDetection.decision, distanceDetection.distanceCm);
        previous = distanceDetection.decision;
    }
    delay(100);
}
