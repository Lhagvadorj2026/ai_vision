// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { BleManager, Device } from 'react-native-ble-plx';
import * as Speech from 'expo-speech';
import { Buffer } from 'buffer';

const bleManager = new BleManager();

// Nordic UART Service UUIDs
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export default function App() {
  // GPS & Map States
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // BLE States
  const [device, setDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Холбогдоогүй');
  const [currentDetection, setCurrentDetection] = useState('Хүлээж байна...');

  useEffect(() => {
    requestPermissions();
    return () => {
      bleManager.destroy();
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
    }

    // GPS байршил авах зөвшөөрөл болон байршил тогтоох
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('Байршил тогтоох зөвшөөрөл олгогдоогүй байна');
      Speech.speak('Байршил тогтоох зөвшөөрөл олгогдоогүй байна', { language: 'en-US' });
      return;
    }

    let currentLocation = await Location.getCurrentPositionAsync({});
    setLocation(currentLocation.coords);
  };

  const speak = (text: string) => {
    Speech.stop();
    Speech.speak(text, { language: 'en-US', rate: 1.0 });
  };

  const handleIncomingData = (data: string) => {
    const cleanData = data.trim();
    console.log('Received BLE Data:', cleanData);

    switch (cleanData) {
      case 'RED_STOP':
        setCurrentDetection('🛑 УЛААН ГЭРЭЛ - ЗОГСОХ');
        speak('Red light. Stop.');
        break;
      case 'GREEN_GO':
        setCurrentDetection('🟢 НОГООН ГЭРЭЛ - ЯВАХ');
        speak('Green light. Go.');
        break;
      case 'OBSTACLE':
        setCurrentDetection('⚠️ СААД ТААРЛАА');
        speak('Warning. Obstacle detected.');
        break;
      case 'CLEAR':
        setCurrentDetection('✅ ЗАМ ЦЭВЭР');
        speak('Path clear.');
        break;
      default:
        setCurrentDetection(`Мэдээлэл: ${cleanData}`);
        break;
    }
  };

  const startScan = () => {
    setIsScanning(true);
    setConnectionStatus('Төхөөрөмж хайж байна...');

    bleManager.startDeviceScan(null, null, (error, scannedDevice) => {
      if (error) {
        console.error('Scan error:', error);
        setIsScanning(false);
        setConnectionStatus('Хайлт бүтэлгүйтлээ');
        return;
      }

      if (scannedDevice && scannedDevice.name) {
        console.log('Олдсон төхөөрөмж:', scannedDevice.name);

        if (scannedDevice.name.toUpperCase().includes('ESP32')) {
          bleManager.stopDeviceScan();
          setIsScanning(false);
          connectToDevice(scannedDevice);
        }
      }
    });
  };

  const connectToDevice = async (selectedDevice: Device) => {
    try {
      setConnectionStatus('Холбогдож байна...');
      const connectedDevice = await selectedDevice.connect();
      setDevice(connectedDevice);
      setConnectionStatus('Холбогдсон');

      await connectedDevice.discoverAllServicesAndCharacteristics();
      startStreaming(connectedDevice);
      speak('Device connected.');
    } catch (error) {
      console.error('Connection error:', error);
      setConnectionStatus('Холбогдож чадсангүй');
    }
  };

  const startStreaming = (connectedDevice: Device) => {
    connectedDevice.monitorCharacteristicForService(
      UART_SERVICE_UUID,
      UART_TX_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          console.error('Stream error:', error);
          return;
        }
        if (characteristic?.value) {
          const rawData = Buffer.from(characteristic.value, 'base64').toString('utf-8');
          handleIncomingData(rawData);
        }
      }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* 1. Дээд хэсэг: Гарчиг болон Bluetooth төлөв */}
      <View style={styles.header}>
        <Text style={styles.title}>AI Vision Assistant</Text>
        <Text style={styles.statusText}>Төлөв: {connectionStatus}</Text>
      </View>

      {/* 2. Дунд хэсэг: Google Map (Хэрэглэгчийн GPS байршлыг харуулах) */}
      <View style={styles.mapContainer}>
        {location ? (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
            showsUserLocation={true}
            followsUserLocation={true}
          >
            <Marker
              coordinate={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              title="Таны байршил"
            />
          </MapView>
        ) : (
          <View style={styles.loadingMap}>
            <Text style={styles.loadingText}>{errorMsg || 'Байршил тогтоож байна...'}</Text>
          </View>
        )}
      </View>

      {/* 3. Доод хэсэг: ESP32 камераас ирсэн саад болон гэрлэн дохионы мэдээлэл */}
      <View style={styles.detectionBox}>
        <Text style={styles.detectionLabel}>Сүүлийн илэрц:</Text>
        <Text style={styles.detectionValue}>{currentDetection}</Text>
      </View>

      {/* 4. Bluetooth холбох товчлуур */}
      <TouchableOpacity
        style={[styles.button, isScanning && styles.buttonDisabled]}
        onPress={startScan}
        disabled={isScanning}
      >
        <Text style={styles.buttonText}>
          {isScanning ? 'Хайж байна...' : 'ESP32 Холбох'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statusText: {
    fontSize: 14,
    color: '#AAAAAA',
    marginTop: 4,
  },
  mapContainer: {
    height: Dimensions.get('window').height * 0.35,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333333',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingMap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
  },
  loadingText: {
    color: '#888888',
    fontSize: 14,
  },
  detectionBox: {
    backgroundColor: '#1E1E1E',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
    marginBottom: 15,
  },
  detectionLabel: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 6,
  },
  detectionValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#555555',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});