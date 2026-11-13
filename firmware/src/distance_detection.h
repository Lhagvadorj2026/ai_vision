#pragma once
#include <math.h>

// Debounce measurements; the phone handles one warning per encounter.
struct DistanceDetection
{
    const char *decision = "WAITING";
    int distanceCm = -1;
    int nearSamples = 0;
    int farSamples = 0;

    void update(float cm)
    {
        if (!isfinite(cm) || cm < 2.0f || cm > 400.0f)
        {
            distanceCm = -1;
            decision = "UNKNOWN";
            nearSamples = farSamples = 0;
            return;
        }
        distanceCm = (int)roundf(cm);
        if (cm <= 150.0f)
        {
            if (nearSamples < 2) nearSamples++;
            farSamples = 0;
            if (cm <= 50.0f || nearSamples >= 2)
            {
                decision = "OBSTACLE";
            }
        }
        else
        {
            if (farSamples < 2) farSamples++;
            nearSamples = 0;
            if (farSamples >= 2)
            {
                decision = "CLEAR";
            }
        }
    }
};
