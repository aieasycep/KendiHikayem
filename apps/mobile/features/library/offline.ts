/**
 * features/library/offline.ts — çevrimdışı indirme motoru (F2).
 *
 * ÜRÜN GEREKÇESİ: rakibin en yıkıcı hatası "internet gidince hiçbir şey
 * yüklenmiyordu" (docs/research/07). Bizde indirilen bir masal uçak modunda
 * TAM çalışır: metin + kelime zamanlaması + görseller + ses cihazdadır.
 *
 * TASARIM
 *  - `PlayerManifest` JSON olarak diske yazılır → metin ve karaoke zamanlaması
 *    her durumda çevrimdışı (bu, dosya indirme başarısız olsa bile çalışır).
 *  - Görseller ve ses `expo-file-system/legacy` ile indirilir. Mock ortamında
 *    CDN 404 döner — bu KABUL EDİLEN bir kısmi durumdur: kayıt "kısmi" olarak
 *    işaretlenir, ekran MediaImage yer tutucusuyla yaşar.
 *  - `offline/index.json` hafif bir dizindir; manifest her hikayenin kendi
 *    klasöründedir (offline/<storyId>/manifest.json).
 */

import { useQuery } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';

import type { PlayerManifest, Story } from '@kendihikayem/contract';

const ROOT = `${FileSystem.documentDirectory ?? ''}offline/`;
const INDEX_PATH = `${ROOT}index.json`;

export interface OfflineStoryMeta {
  storyId: string;
  titleTr: string;
  heroName: string;
  downloadedAt: string;
  /** Kaç varlık istendi / kaçı gerçekten indi. Eşit değilse "kısmi". */
  assetsRequested: number;
  assetsCompleted: number;
  /** Yerel dosya adresleri. Anahtarlar: 'audio', 'cover', 'page-3'... */
  files: Record<string, string>;
  totalDurationMs: number;
  pageCount: number;
}

export type OfflineIndex = Record<string, OfflineStoryMeta>;

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) await FileSystem.makeDirectoryAsync(path, { intermediates: true });
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return undefined;
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(ROOT);
  await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
}

export async function getOfflineIndex(): Promise<OfflineIndex> {
  return (await readJson<OfflineIndex>(INDEX_PATH)) ?? {};
}

export async function getOfflineStory(storyId: string): Promise<OfflineStoryMeta | undefined> {
  const index = await getOfflineIndex();
  return index[storyId];
}

export async function loadOfflineManifest(
  storyId: string,
): Promise<PlayerManifest | undefined> {
  return readJson<PlayerManifest>(`${ROOT}${storyId}/manifest.json`);
}

/** Tek bir uzak dosyayı indirir; başarısızlık sessizce tolere edilir (404 mock). */
async function tryDownload(url: string, destination: string): Promise<string | undefined> {
  try {
    const result = await FileSystem.downloadAsync(url, destination);
    if (result.status >= 200 && result.status < 300) return result.uri;
    await FileSystem.deleteAsync(destination, { idempotent: true });
    return undefined;
  } catch {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    return undefined;
  }
}

export interface DownloadProgress {
  done: number;
  total: number;
  labelTr: string;
}

/**
 * Hikayeyi çevrimdışına indirir. Manifest + görseller + ses.
 * Kısmi başarı kabul edilir; ekran `assetsCompleted / assetsRequested` gösterir.
 */
export async function downloadStoryOffline(
  story: Story,
  manifest: PlayerManifest,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<OfflineStoryMeta> {
  const dir = `${ROOT}${story.id as string}/`;
  await ensureDir(dir);
  await writeJson(`${dir}manifest.json`, manifest);

  interface Task {
    key: string;
    url: string;
    file: string;
    labelTr: string;
  }
  const tasks: Task[] = [];

  if (story.cover !== undefined) {
    tasks.push({ key: 'cover', url: story.cover.url, file: `${dir}kapak.img`, labelTr: 'Kapak indiriliyor' });
  }
  tasks.push({
    key: 'audio',
    url: manifest.audio.url,
    file: `${dir}ses.m4a`,
    labelTr: `${manifest.voice.label} sesi indiriliyor`,
  });
  for (const page of manifest.pages) {
    tasks.push({
      key: `page-${page.pageNo}`,
      url: page.image.url,
      file: `${dir}sayfa-${page.pageNo}.img`,
      labelTr: `${page.pageNo}. sayfanın resmi indiriliyor`,
    });
  }

  const files: Record<string, string> = {};
  let done = 0;
  for (const task of tasks) {
    onProgress?.({ done, total: tasks.length, labelTr: task.labelTr });
    const uri = await tryDownload(task.url, task.file);
    if (uri !== undefined) files[task.key] = uri;
    done += 1;
  }
  onProgress?.({ done, total: tasks.length, labelTr: 'Tamamlanıyor' });

  const meta: OfflineStoryMeta = {
    storyId: story.id as string,
    titleTr: story.title ?? manifest.titleTr,
    heroName: story.heroName,
    downloadedAt: new Date().toISOString(),
    assetsRequested: tasks.length,
    assetsCompleted: Object.keys(files).length,
    files,
    totalDurationMs: manifest.totalDurationMs,
    pageCount: manifest.pages.length,
  };

  const index = await getOfflineIndex();
  index[meta.storyId] = meta;
  await writeJson(INDEX_PATH, index);
  return meta;
}

export async function removeOfflineStory(storyId: string): Promise<void> {
  await FileSystem.deleteAsync(`${ROOT}${storyId}`, { idempotent: true }).catch(() => undefined);
  const index = await getOfflineIndex();
  delete index[storyId];
  await writeJson(INDEX_PATH, index);
}

/** Kitaplık rozetleri ve çevrimdışı geri düşüş listesi. */
export function useOfflineIndex() {
  return useQuery<OfflineIndex>({
    queryKey: ['offline-index'],
    queryFn: getOfflineIndex,
    staleTime: 10_000,
  });
}

/** Sayfa görseli için yerel kopya (varsa). */
export function offlinePageImage(
  meta: OfflineStoryMeta | undefined,
  pageNo: number,
): string | undefined {
  return meta?.files[`page-${pageNo}`];
}

export function offlineAudio(meta: OfflineStoryMeta | undefined): string | undefined {
  return meta?.files['audio'];
}

export function offlineCover(meta: OfflineStoryMeta | undefined): string | undefined {
  return meta?.files['cover'];
}
