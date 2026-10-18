#pragma once
#include <Arduino.h>
#include "esp_camera.h"

enum Light
{
    LIGHT_NONE,
    LIGHT_RED,
    LIGHT_GREEN
};

inline void pixelRGB(const uint8_t *buf, int w, int x, int y, int &r, int &g, int &b)
{
    const uint8_t *p = buf + (y * w + x) * 2;
    uint16_t v = (p[0] << 8) | p[1]; // RGB565, big-endian
    r = ((v >> 11) & 0x1F) << 3;
    g = ((v >> 5) & 0x3F) << 2;
    b = (v & 0x1F) << 3;
}

// Saturated red/green blobs in the upper half of the frame.
inline Light detectTrafficLight(const camera_fb_t *fb)
{
    int red = 0, green = 0;
    for (int y = 0; y < fb->height / 2; y += 2)
    {
        for (int x = 0; x < fb->width; x += 2)
        {
            int r, g, b;
            pixelRGB(fb->buf, fb->width, x, y, r, g, b);
            if (r > 190 && g < 100 && b < 100)
                red++;
            else if (g > 170 && r < 120 && b < 150)
                green++;
        }
    }
    const int MIN_PIXELS = 12;
    if (red < MIN_PIXELS && green < MIN_PIXELS)
        return LIGHT_NONE;
    return red >= green ? LIGHT_RED : LIGHT_GREEN;
}

// Camera-only obstacle detection. Three cues are voted on over the path ahead
// (central lower area): edge density, colour deviation from the floor, and
// edge growth between frames (object getting closer).
struct ObstacleState
{
    int prevEdgePct = 0;
    int hits = 0;
};

inline bool detectObstacle(const camera_fb_t *fb, ObstacleState &st)
{
    const int w = fb->width;
    const int cx0 = w / 4, cx1 = w * 3 / 4;
    const int y0 = fb->height / 2, y1 = fb->height - 4;

    int edges = 0, total = 0;
    long cR = 0, cG = 0, cB = 0, cN = 0; // centre mean colour
    long fR = 0, fG = 0, fB = 0, fN = 0; // floor reference (side bands)

    for (int y = y0; y < y1; y += 3)
    {
        for (int x = 0; x < w - 3; x += 3)
        {
            int r, g, b;
            pixelRGB(fb->buf, w, x, y, r, g, b);
            bool centre = x >= cx0 && x < cx1;
            if (centre)
            {
                int r2, g2, b2;
                pixelRGB(fb->buf, w, x + 3, y, r2, g2, b2);
                if (abs((r + g + b) / 3 - (r2 + g2 + b2) / 3) > 40)
                    edges++;
                total++;
                cR += r;
                cG += g;
                cB += b;
                cN++;
            }
            else if (x < w / 8 || x >= w * 7 / 8)
            {
                fR += r;
                fG += g;
                fB += b;
                fN++;
            }
        }
    }
    if (total == 0 || cN == 0 || fN == 0)
        return false;

    int edgePct = edges * 100 / total;
    int colourDiff = abs((int)(cR / cN - fR / fN)) + abs((int)(cG / cN - fG / fN)) +
                     abs((int)(cB / cN - fB / fN));

    int score = 0;
    if (edgePct > 25)
        score++; // cluttered centre
    if (colourDiff > 60)
        score++; // centre differs from floor
    if (edgePct - st.prevEdgePct > 10)
        score++; // looming
    st.prevEdgePct = edgePct;

    // Require 2 cues and 2 consecutive frames to suppress flicker.
    st.hits = score >= 2 ? st.hits + 1 : 0;
    return st.hits >= 2;
}

inline const char *decide(bool obstacle, Light light)
{
    if (obstacle)
        return "OBSTACLE";
    if (light == LIGHT_RED)
        return "RED_STOP";
    if (light == LIGHT_GREEN)
        return "GREEN_GO";
    return "CLEAR";
}