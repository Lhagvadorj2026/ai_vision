#include "../src/distance_detection.h"
#include <assert.h>
#include <string.h>

int main()
{
    DistanceDetection d;
    d.update(-1);
    assert(strcmp(d.decision, "UNKNOWN") == 0 && d.distanceCm == -1);
    d.update(220);
    assert(strcmp(d.decision, "UNKNOWN") == 0);
    d.update(220);
    assert(strcmp(d.decision, "CLEAR") == 0);
    d.update(149);
    d.update(160); // Isolated spike must not trigger an alert.
    assert(strcmp(d.decision, "CLEAR") == 0);
    d.update(100);
    d.update(100);
    assert(strcmp(d.decision, "OBSTACLE") == 0 && d.distanceCm == 100);
    d.update(160); // Require two outside measurements to clear the state.
    assert(strcmp(d.decision, "OBSTACLE") == 0);
    d.update(160);
    assert(strcmp(d.decision, "CLEAR") == 0);
    d.update(40); // Urgent proximity bypasses debounce.
    assert(strcmp(d.decision, "OBSTACLE") == 0);
    d.update(NAN);
    assert(strcmp(d.decision, "UNKNOWN") == 0 && d.distanceCm == -1);
    d.update(160);
    assert(strcmp(d.decision, "UNKNOWN") == 0);
    d.update(999);
    assert(strcmp(d.decision, "UNKNOWN") == 0);
    for (int i = 0; i < 100000; ++i) d.update(100);
    assert(d.nearSamples == 2 && strcmp(d.decision, "OBSTACLE") == 0);
}
