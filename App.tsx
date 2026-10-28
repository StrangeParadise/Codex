import { useRef, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { lookup } from './src/product';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState<Awaited<ReturnType<typeof lookup>> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  async function search(code: string) {
    if (locked.current) return;
    locked.current = true; setScanning(false); setBarcode(code); setBusy(true); setError(''); setProduct(null);
    try { setProduct(await lookup(code)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Lookup failed. Check your connection.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function scan() {
    const p = permission?.granted ? permission : await requestPermission();
    if (p.granted) setScanning(true);
    else setError('Camera access is unavailable. Enter the barcode below, or enable Camera in iPhone Settings.');
  }
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <StatusBar style="dark" />
    <Text style={styles.title}>Shelf Check</Text>
    <Text>Scan Australian supermarket products. Nutrition coverage varies; prices are not yet connected.</Text>
    {scanning ? <View><CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={({ data }) => { void search(data); }} /><Button title="Cancel scanning" onPress={() => setScanning(false)} /></View>
      : <Button title="Scan barcode" onPress={() => { void scan(); }} disabled={busy} />}
    <TextInput accessibilityLabel="Barcode" style={styles.input} placeholder="Enter EAN or UPC barcode" keyboardType="number-pad" value={barcode} onChangeText={setBarcode} editable={!busy} />
    <Button title="Look up product" disabled={busy || scanning} onPress={() => { void search(barcode.trim()); }} />
    {busy && <ActivityIndicator accessibilityLabel="Loading product" />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {product && <View style={styles.card}>
      <Text style={styles.heading}>{product.name}</Text><Text>{product.brand}</Text>
      <Text style={styles.heading}>{product.health ? `${product.health.value}/100` : 'Score unavailable'}</Text>
      <Text>Experimental nutrient score. Higher means lower amounts of the three nutrients below. It is not an Australian Health Star Rating or medical advice and does not assess overall food quality.</Text>
      <Text>Per 100 g (or 100 mL as supplied by the source)</Text>
      <Text>Sugars: {product.sugars === null ? 'Unavailable' : `${product.sugars} g`}</Text>
      <Text>Saturated fat: {product.saturatedFat === null ? 'Unavailable' : `${product.saturatedFat} g`}</Text>
      <Text>Sodium: {product.sodium === null ? 'Unavailable' : `${Math.round(product.sodium)} mg`}</Text>
      {product.health?.parts.map(p => <Text key={p.label}>{p.label}: −{p.penalty.toFixed(1)} points</Text>)}
      {!product.health && <Text>All three nutrient values are required to calculate a score.</Text>}
      <Text>Price: unavailable — no retailer price provider connected.</Text>
      <Text>Source: Open Food Facts contributors, ODbL. Community data may be incomplete or outdated; check the pack label. Barcode does not identify store, current price, or Australian origin.</Text>
    </View>}
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { padding: 24, paddingTop: 64, gap: 18 }, title: { fontSize: 34, fontWeight: '700', color: '#155b43' }, heading: { fontSize: 23, fontWeight: '600' }, input: { borderWidth: 1, borderColor: '#888', borderRadius: 8, padding: 14 }, camera: { height: 280 }, error: { color: '#a12020' }, card: { padding: 18, backgroundColor: '#eef5ef', borderRadius: 12, gap: 12 } });
