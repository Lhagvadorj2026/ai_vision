#include <Arduino.h>
#include <WiFi.h>
#include "esp_http_server.h"
#include "camera_config.h"
#include "vision.h"
#include "ble_service.h"

// Wi-Fi мэдээлэл (ESP32-CAM стрим цацахад локал IP ашиглана)
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";

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
            size_t hlen = snprintf(part_buf, 64, "--123456789000000000000987654321\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", _jpg_buf_len);
            // Энд httpd_req_send-ийг httpd_resp_send болгов
            res = httpd_resp_send(req, part_buf, hlen);
        }
        if (res == ESP_OK)
        {
            res = httpd_resp_send(req, (char *)_jpg_buf, _jpg_buf_len);
        }
        if (res == ESP_OK)
        {
            res = httpd_resp_send(req, "\r\n", 2);
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
