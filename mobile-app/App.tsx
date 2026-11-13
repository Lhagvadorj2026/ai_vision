import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  Dimensions,
  ScrollView,
} from 'react-native';
import CameraStream from './components/CameraStream';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';

import { useCameraStatus } from './hooks/useCameraStatus';
import { useObjectDetection } from './hooks/useObjectDetection';
import { objectName } from './lib/vision';
import { getAiVision } from './modules/ai-vision';
import { mongolianClips } from './lib/mongolianAudio';
import { ProximityGate } from './lib/proximityGate';

const detectionLabels = {
  WAITING: 'Мэдээлэл хүлээж байна...',
  UNKNOWN: 'Мэдрэгчийн мэдээлэл ирэхгүй байна',
  CLEAR: 'Мэдрэгч 1.5 метрийн дотор саад илрүүлээгүй',
  OBSTACLE: '⚠️ СААД ТААРЛАА',
  RED_STOP: '🛑 УЛААН ГЭРЭЛ - ЗОГСОХ',
  GREEN_GO: '🟢 НОГООН ГЭРЭЛ - ЯВАХ',
};
const connectionLabels = {
  disconnected: 'Холбогдоогүй',
  connecting: 'Wi-Fi-аар холбогдож байна...',
  connected: 'Wi-Fi-аар холбогдсон',
  error: 'Мэдээллийн холболт тасарсан — дахин оролдож байна...',
};

export default function App() {
  // GPS & Map States
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [speechError, setSpeechError] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const { connection, decision, distanceCm } = useCameraStatus(streamUrl);
  const vision = useObjectDetection(streamUrl);
  const latestReading = useRef({ connection, decision, distanceCm, vision });
  latestReading.current = { connection, decision, distanceCm, vision };
  const [speechVoice, setSpeechVoice] = useState<Speech.Voice | null>(null);

  useEffect(() => {
    let active = true;
    void Speech.getAvailableVoicesAsync().then(voices => {
      const mongolian = voices.find(voice => {
        const language = voice.language.toLowerCase().replace('_', '-');
        return language === 'mn' || language.startsWith('mn-') || language === 'mon' || language.startsWith('mon-');
      });
      if (active && mongolian) setSpeechVoice(mongolian);
    }).catch(() => { /* The bundled Mongolian warning audio remains available. */ });
    return () => { active = false; };
  }, []);
  const currentDetection = decision
    ? detectionLabels[decision]
    : connection === 'error' ? 'Мэдээлэл тасарсан' : 'Хүлээж байна...';

  useEffect(() => {
    let active = true;
    const locate = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (status !== 'granted') {
          setErrorMsg('Байршил тогтоох зөвшөөрөл олгогдоогүй байна');
          return;
        }
        const currentLocation = await Location.getCurrentPositionAsync({});
        if (active) setLocation(currentLocation.coords);
      } catch {
        if (active) setErrorMsg('Байршил тогтоож чадсангүй');
      }
    };
    void locate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    let lastKey = '';
    let lastAt = 0;
    const proximityGate = new ProximityGate();
    let wasInside = false;
    let audioPending = false;
    let clearAnnounced = false;
    let lastVisionLabel = '';
    let visionMissingSince: number | null = null;
    const hasClearReading = (reading: typeof latestReading.current) => {
      const cm = reading.distanceCm;
      return reading.connection === 'connected' &&
        reading.decision === 'CLEAR' &&
        cm !== null &&
        Number.isFinite(cm) &&
        cm > 150 &&
        cm <= 400;
    };
    const announce = () => {
      const reading = latestReading.current;
      const isClear = hasClearReading(reading);
      if (!isClear) clearAnnounced = false;
      const AiVision = getAiVision();
      let key = '';
      let text = '';
      const object = reading.vision.status === 'running' && Date.now() - reading.vision.seenAt < 2500
        ? reading.vision.object : null;
      const now = Date.now();
      const proximity = proximityGate.update(
        reading.connection === 'connected' ? reading.distanceCm : null,
        reading.decision === 'OBSTACLE', now,
      );
      if (wasInside && !proximity.inside) {
        void Speech.stop();
        if (AiVision?.stopMongolian) void AiVision.stopMongolian().catch(() => { });
      }
      wasInside = proximity.inside;
      if (object) visionMissingSince = null;
      else {
        if (visionMissingSince === null) visionMissingSince = now;
        if (now - visionMissingSince >= 2000) lastVisionLabel = '';
      }
      if (audioPending) return;
      const objectText = object
        ? `Урд ${objectName(object.label, true)} харагдаж байна. `
        : '';
      if (reading.connection === 'error') {
        key = `connection-error-${object?.label ?? ''}`;
        text = objectText + 'Зайны мэдээллийн холболт тасарлаа.';
      } else if (proximity.entering) {
        key = 'obstacle-stop';
        text = 'Урд саад байна. Зогсоно уу.';
      } else if (isClear && !clearAnnounced) {
        key = 'nearby-clear';
        text = 'Ойрын саад илрээгүй.';
      } else if (
        reading.connection === 'connected' &&
        reading.decision === 'CLEAR' &&
        !object &&
        (reading.vision.status === 'error' || reading.vision.status === 'needs-build')
      ) {
        key = 'vision-unavailable';
        text = 'Камерын танилт ажиллахгүй байна.';
      }
      // AI runs independently, including while the range endpoint is connecting.
      if (!text && objectText && object!.label !== lastVisionLabel) {
        key = `vision-${object!.label}`;
        text = objectText;
      }
      if (!text) return;
      const changed = proximity.entering || key === 'nearby-clear' || key !== lastKey;
      if (!changed) return;
      if (!proximity.entering && lastAt && now - lastAt < 3000) return;
      lastKey = key;
      lastAt = now;
      audioPending = true;
      void Speech.stop().then(async () => {
        if (!active) return;
        if (proximity.entering) {
          const latest = latestReading.current;
          if (latest.connection !== 'connected' || latest.distanceCm === null || latest.distanceCm > 150) return;
        }
        if (key === 'nearby-clear' && !hasClearReading(latestReading.current)) return;
        if (speechVoice) {
          Speech.speak(text, {
            language: speechVoice.language,
            voice: speechVoice.identifier,
            rate: 0.95,
            onStart: () => { if (active) setSpeechError(false); },
            onError: () => { if (active) setSpeechError(true); },
          });
        } else {
          if (!AiVision?.speakMongolian) throw new Error('Mongolian audio requires the new iPhone build');
          const clips = mongolianClips({
            connection: reading.connection, decision: reading.decision, distanceCm: reading.distanceCm,
            objectLabel: object?.label ?? null,
            visionUnavailable: reading.vision.status === 'error' || reading.vision.status === 'needs-build',
            proximityEntry: proximity.entering,
            clearEntry: key === 'nearby-clear',
          });
          if (!clips.length || !active) return;
          await AiVision.speakMongolian(clips);
          if (active) setSpeechError(false);
        }
        if (proximity.entering) proximityGate.markAnnounced();
        if (key === 'nearby-clear') clearAnnounced = true;
        else if (object && key !== 'obstacle-stop') lastVisionLabel = object.label;
      }).catch(() => { if (active) setSpeechError(true); }).finally(() => { audioPending = false; });
    };
    if (streamUrl) announce();
    const timer = setInterval(() => { if (streamUrl) announce(); }, 500);
    return () => {
      active = false;
      clearInterval(timer);
      void Speech.stop();
      const AiVision = getAiVision();
      if (AiVision?.stopMongolian) void AiVision.stopMongolian().catch(() => { });
    };
  }, [streamUrl, speechVoice]);

return (
  <SafeAreaView style={styles.container}>
    <StatusBar barStyle="light-content" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>

      {/* 1. Дээд хэсэг: Гарчиг болон Wi-Fi төлөв */}
      <View style={styles.header}>
        <Text style={styles.title}>AI Vision Assistant</Text>
        <Text style={styles.statusText}>Төлөв: {connectionLabels[connection]}</Text>
      </View>

      <CameraStream onStreamChange={setStreamUrl} />

      <View style={styles.detectionBox}>
        <Text style={styles.detectionLabel}>Камерын AI танилт · iPhone дээр</Text>
        <Text accessibilityLiveRegion="polite" style={styles.detectionValue}>
          {vision.status === 'needs-build' ? 'AI модультай iPhone аппыг дахин суулгана уу'
            : vision.status === 'error' ? 'AI зураг авч чадсангүй — дахин оролдож байна'
              : vision.status === 'loading' ? 'AI загвар ачаалж байна...'
                : vision.status === 'idle' ? 'Камераа асаана уу'
                  : vision.object ? `Урд: ${objectName(vision.object.label, true)}`
                    : 'Төв хэсэгт объект танигдаагүй'}
        </Text>
        <Text style={styles.statusText}>AI объектын нэрийг, HC-SR04 зайг тусад нь мэдээлнэ.</Text>
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
        <Text style={styles.detectionLabel}>HC-SR04 · зайны хэмжилт</Text>
        <Text accessibilityLiveRegion="assertive" style={[styles.detectionValue, { color: decision === 'OBSTACLE' ? '#FF6B6B' : decision === 'CLEAR' ? '#4CAF50' : '#FFCC66' }]}>{currentDetection}</Text>
        {distanceCm !== null && <Text style={styles.statusText}>Урд талын зай: {distanceCm} см</Text>}
        <Text style={styles.statusText}>Монгол дуу хоолой · офлайн</Text>
        {speechError && <Text accessibilityRole="alert" style={styles.statusText}>Дуугаар анхааруулж чадсангүй. Дууны тохиргоогоо шалгана уу.</Text>}
      </View>

    </ScrollView>
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
});
