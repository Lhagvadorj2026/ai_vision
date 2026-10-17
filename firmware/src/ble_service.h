#pragma once
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_UUID "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

static BLECharacteristic *notifyChar;
static bool bleConnected = false;
static String lastSent;

class ServerCb : public BLEServerCallbacks
{
    void onConnect(BLEServer *) override { bleConnected = true; }
    void onDisconnect(BLEServer *s) override
    {
        bleConnected = false;
        lastSent = "";
        s->startAdvertising();
    }
};

inline void initBle()
{
    BLEDevice::init("ESP32-CAM-Vision");
    BLEServer *server = BLEDevice::createServer();
    server->setCallbacks(new ServerCb());
    BLEService *svc = server->createService(SERVICE_UUID);
    notifyChar = svc->createCharacteristic(CHAR_UUID, BLECharacteristic::PROPERTY_NOTIFY);
    notifyChar->addDescriptor(new BLE2902());
    svc->start();
    BLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
    BLEDevice::startAdvertising();
}

// Notifies only when the decision changes.
inline void sendBle(const char *msg)
{
    if (!bleConnected || lastSent == msg)
        return;
    notifyChar->setValue((uint8_t *)msg, strlen(msg));
    notifyChar->notify();
    lastSent = msg;
}
