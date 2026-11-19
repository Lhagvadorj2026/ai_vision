import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

const DEFAULT_CAMERA_URL = 'http://192.168.1.16/stream';

type Props = {
  onStreamChange: (url: string | null) => void;
};
export default React.memo(function CameraStream({ onStreamChange }: Props) {
  const [address, setAddress] = useState(DEFAULT_CAMERA_URL);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    onStreamChange(url);
  }, [url, onStreamChange]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') setUrl(null);
    });
    return () => subscription.remove();
  }, []);

  const connect = () => {
    try {
      const input = address.trim();
      const parsed = new URL(input.includes('://') ? input : `http://${input}`);
      if (!input || !parsed.hostname || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error('Invalid address');
      }
      if (parsed.pathname === '/') parsed.pathname = '/stream';
      parsed.hash = '';
      setError('');
      setUrl(parsed.toString());
    } catch {
      setError('ESP32-ийн IP эсвэл stream URL оруулна уу. Жишээ: 192.168.1.100');
    }
  };

  // Embed MJPEG as an image: a top-level multipart document is not portable across WebViews.
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000;color:#ddd;font:14px sans-serif}img{width:100%;height:100%;object-fit:contain}p{position:absolute;top:8px;left:12px}</style></head><body><p id="status">Камерын дүрс хүлээж байна…</p><img id="camera" alt="ESP32-CAM"><script>
    const camera = document.getElementById('camera');
    const status = document.getElementById('status');
    const fail = () => window.ReactNativeWebView.postMessage('error');
    const timer = setTimeout(() => { status.textContent = 'Дүрс харагдахгүй бол Wi-Fi болон IP хаягаа шалгана уу.'; }, 12000);
    camera.onload = () => { clearTimeout(timer); status.remove(); };
    camera.onerror = () => { clearTimeout(timer); fail(); };
    camera.src = ${JSON.stringify(url).replace(/</g, '\\u003c')};
  </script></body></html>`;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>ESP32-CAM камер</Text>
      <Text style={styles.hint}>Утас, камер нэг Wi-Fi сүлжээнд холбогдсон байна.</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="192.168.1.100 эсвэл http://IP/stream"
        placeholderTextColor="#999"
        accessibilityLabel="ESP32 камерын IP эсвэл stream URL"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!url}
        onSubmitEditing={connect}
      />
      {url && (
        <View style={styles.preview}>
          <WebView
            key={url}
            source={{ html, baseUrl: url }}
            originWhitelist={['*']}
            mixedContentMode="always"
            scrollEnabled={false}
            onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === url}
            onMessage={event => {
              if (event.nativeEvent.data === 'error') {
                setError('Камерт холбогдсонгүй. Wi-Fi, IP хаяг болон /stream серверээ шалгаад дахин оролдоно уу.');
                setUrl(null);
              }
            }}
            onError={() => {
              setError('Камерын дүрс нээгдсэнгүй. Холболтоо шалгана уу.');
              setUrl(null);
            }}
            style={styles.webview}
          />
        </View>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={url ? () => setUrl(null) : connect}>
        <Text style={styles.buttonText}>{url ? 'Камер зогсоох' : 'Камер асаах'}</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: { marginBottom: 15, padding: 12, borderRadius: 12, backgroundColor: '#1E1E1E' },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  hint: { color: '#aaa', marginVertical: 8 },
  input: { color: '#fff', borderColor: '#555', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 10 },
  preview: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#000', marginBottom: 10 },
  webview: { flex: 1, backgroundColor: '#000' },
  error: { color: '#ff9999', marginBottom: 10 },
  button: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
