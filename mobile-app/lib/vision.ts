import type { DetectedObject } from '../modules/ai-vision';

// Vision boxes are normalized to the original frame, with a top-left origin.
// A central object is a candidate, not proof that a walking path is obstructed.
export function centralCandidate(objects: DetectedObject[]): DetectedObject | null {
  return objects.filter(object => {
    const values = [object.confidence, object.x, object.y, object.width, object.height];
    if (!values.every(Number.isFinite)) return false;
    const center = object.x + object.width / 2;
    return object.confidence >= 0.55 && object.x >= 0 && object.y >= 0 && object.width > 0 && object.height > 0
      && object.x + object.width <= 1.01 && object.y + object.height <= 1.01
      && center >= 0.25 && center <= 0.75 && object.y + object.height >= 0.35
      && object.width * object.height >= 0.02;
  }).sort((a, b) => (b.width * b.height * b.confidence) - (a.width * a.height * a.confidence))[0] ?? null;
}

const names: Record<string, string> = {
  person: 'хүн', bicycle: 'унадаг дугуй', car: 'машин', motorcycle: 'мотоцикл',
  bus: 'автобус', truck: 'ачааны машин', dog: 'нохой', cat: 'муур',
  chair: 'сандал', couch: 'буйдан', sofa: 'буйдан', bench: 'урт сандал',
  'dining table': 'ширээ', diningtable: 'ширээ', bed: 'ор', pottedplant: 'ургамал',
  'potted plant': 'ургамал', suitcase: 'чемодан', backpack: 'үүргэвч',
  bottle: 'лонх', tvmonitor: 'дэлгэц', tv: 'дэлгэц', toilet: 'суултуур',
  'traffic light': 'гэрлэн дохио', 'stop sign': 'зогс тэмдэг',
  airplane: 'онгоц', train: 'галт тэрэг', boat: 'завь', 'fire hydrant': 'галын усны багана',
  'parking meter': 'зогсоолын тоолуур', bird: 'шувуу', horse: 'морь', sheep: 'хонь',
  cow: 'үхэр', elephant: 'заан', bear: 'баавгай', zebra: 'алаг тахь', giraffe: 'анааш',
  umbrella: 'шүхэр', handbag: 'гар цүнх', tie: 'зангиа', frisbee: 'нисдэг таваг',
  skis: 'цана', snowboard: 'цасан хавтан', 'sports ball': 'бөмбөг', kite: 'цаасан шувуу',
  'baseball bat': 'цохиур', 'baseball glove': 'бээлий', skateboard: 'скейтборд',
  surfboard: 'серфингийн хавтан', 'tennis racket': 'теннисний цохиур', 'wine glass': 'хундага',
  cup: 'аяга', fork: 'сэрээ', knife: 'хутга', spoon: 'халбага', bowl: 'сав',
  banana: 'гадил', apple: 'алим', sandwich: 'хачиртай талх', orange: 'жүрж',
  broccoli: 'брокколи', carrot: 'лууван', 'hot dog': 'зайдастай талх', pizza: 'пицца',
  donut: 'пончик', cake: 'бялуу', laptop: 'зөөврийн компьютер', mouse: 'компьютерийн хулгана',
  remote: 'удирдлага', keyboard: 'компьютерийн гар', 'cell phone': 'гар утас',
  microwave: 'богино долгионы зуух', oven: 'зуух', toaster: 'талх шарагч', sink: 'угаалтуур',
  refrigerator: 'хөргөгч', book: 'ном', clock: 'цаг', vase: 'ваар', scissors: 'хайч',
  'teddy bear': 'чихмэл баавгай', 'hair drier': 'үс хатаагч', toothbrush: 'шүдний сойз',
  motorbike: 'мотоцикл', aeroplane: 'онгоц',
};

export function objectName(label: string, mongolian: boolean) {
  return mongolian ? names[label.toLowerCase()] ?? 'объект' : label;
}

export function objectClip(label: string) {
  const translated = names[label.toLowerCase()];
  if (!translated) return 'object';
  const canonical = Object.keys(names).find(key => names[key] === translated)!;
  return `object_${canonical.replace(/[^a-z0-9]+/g, '_')}`;
}
