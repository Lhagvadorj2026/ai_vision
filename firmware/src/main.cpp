#include <Arduino.h>
#include <WiFi.h>
#include "esp_http_server.h"
#include "camera_config.h"
#include "vision.h"
#include "ble_service.h"

// Wi-Fi мэдээлэл (ESP32-CAM стрим цацахад локал IP ашиглана)
const char *ssid = "univision_99";
const char *password = "88873304Aa";

// HC-SR04 мэдрэгчийн пин холболтууд
const int trigPin = 12;
const int echoPin = 14;

// Stream сервер бариул
httpd_handle_t camera_httpd = NULL;

// Камерын стрим хэндлер (MJPEG формат)
static esp_err_t stream_handler(httpd_req_t *req)
{
    camera_fb_t *fb = NULL;
    esp_err_t res = ESP_OK;
    size_t _jpg_buf_len = 0;
    uint8_t *_jpg_buf = NULL;
    char part_buf[64];

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
        return 999.0;
    }

    return duration * 0.034 / 2;
}

void setup()
{
    Serial.begin(115200);

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
    initBle();
    startCameraServer();
}

static ObstacleState obstacleState;

void loop()
{
    // Эхлээд ультрасоник мэдрэгчээр 1.5 метрийн дотор саад байгаа эсэхийг шалгах
    float distance = getUltrasonicDistance();

    // Хэрэв саад 1.5 метрээс хол байвал камерыг ажиллуулахгүйгээр алгасах
    if (distance > 150.0)
    {
        Serial.println("Zam cholootei (het hol)");
        delay(200);
        return;
    }

    Serial.print("Saad ilersen zai: ");
    Serial.print(distance);
    Serial.println(" cm.");

    // Камерын зургийг авч боловсруулах
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb)
        return;

    Light light = detectTrafficLight(fb);
    bool obstacle = detectObstacle(fb, obstacleState);
    esp_camera_fb_return(fb);

    const char *decision = decide(obstacle, light);
    Serial.println(decision);
    sendBle(decision);
    delay(200);
}
