/**
 * VoiceCard — Figma `VoiceStudio` "Aile Sesleri" kartı BİREBİR: degrade avatar,
 * ad + "Hazır" rozeti, tarih satırı ve sağda İKİ daire düğme — örnek dinleme
 * (lavanta) ve üç-nokta menüsü (kum).
 *
 * Üç-nokta menüsü alttan açılır: "Örneği dinle" ve "Sesi sil". Silme KVKK
 * disipliniyle çalışır: sonuçlar İŞLEMDEN ÖNCE Türkçe gösterilir, onay kutusu
 * işaretlenmeden silinemez (SesimSection ile aynı sözleşme akışı).
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer } from 'expo-audio';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { VoiceProfile } from '@kendihikayem/contract';
import {
  Button,
  CheckRow,
  NoticeBox,
  PlayIcon,
  Sheet,
  Text,
  palette,
  useTheme,
} from '@kendihikayem/ui';

import { useDeleteVoiceProfile } from '../settings/hooks';

const STATUS_TR: Record<VoiceProfile['status'], string> = {
  draft: 'Taslak — kayıt bekliyor',
  recording: 'Kayıt sürüyor',
  processing: 'İşleniyor',
  preview_ready: 'Önizleme hazır',
  ready: 'Kullanıma hazır',
  failed: 'Başarısız oldu',
  revoked: 'Silindi',
};

function dateTr(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Figma "Hazır" rozeti: adaçayı yeşili metin, %15 adaçayı zemin, 6 yarıçap. */
function ReadyBadge(): ReactNode {
  return (
    <View style={styles.readyBadge}>
      <Text style={styles.readyBadgeText}>Hazır</Text>
    </View>
  );
}

export function VoiceCard({
  profile,
  onApprovePreview,
}: {
  profile: VoiceProfile;
  /** `preview_ready` durumunda "Önizlemeyi dinle ve onayla" akışı (V08). */
  onApprovePreview?: () => void;
}): ReactNode {
  const { colors } = useTheme();
  const deleteProfile = useDeleteVoiceProfile();

  const source = useMemo(
    () => (profile.preview !== undefined ? { uri: profile.preview.url } : null),
    [profile.preview],
  );
  const player = useAudioPlayer(source);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteAck, setDeleteAck] = useState(false);
  const [resultTr, setResultTr] = useState<string[] | undefined>(undefined);

  const playSample = (): void => {
    try {
      player.seekTo(0).catch(() => undefined);
      player.play();
    } catch {
      /* örnek dosya bu ortamda paketli olmayabilir; sessizce geç */
    }
  };

  return (
    <>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <LinearGradient
          colors={[palette.peach, palette.coral]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarEmoji} accessibilityElementsHidden>
            {profile.relation === 'anne' ? '👩' : profile.relation === 'baba' ? '👨' : '🎙️'}
          </Text>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text variant="bodyStrong" style={styles.name} numberOfLines={1}>
              {profile.displayName}
            </Text>
            {profile.status === 'ready' && <ReadyBadge />}
          </View>
          <Text variant="caption" tone="muted" style={styles.sub} numberOfLines={1}>
            {`${STATUS_TR[profile.status]} · ${dateTr(profile.createdAt)}`}
          </Text>
        </View>

        <View style={styles.actions}>
          {/* Figma: 32'lik lavanta dinleme dairesi. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${profile.displayName} — örneği dinle`}
            hitSlop={8}
            disabled={profile.preview === undefined}
            onPress={playSample}
            style={({ pressed }) => [
              styles.circleButton,
              {
                backgroundColor: colors.surfaceRaised,
                opacity: profile.preview === undefined ? 0.4 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <PlayIcon size={12} color={colors.primary} />
          </Pressable>
          {/* Figma: 32'lik üç-nokta menü dairesi. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${profile.displayName} — seçenekler`}
            hitSlop={8}
            onPress={() => {
              setResultTr(undefined);
              setMenuOpen(true);
            }}
            style={({ pressed }) => [
              styles.circleButton,
              { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={5} r={1.6} fill={colors.inkMuted} />
              <Circle cx={12} cy={12} r={1.6} fill={colors.inkMuted} />
              <Circle cx={12} cy={19} r={1.6} fill={colors.inkMuted} />
            </Svg>
          </Pressable>
        </View>
      </View>

      {profile.status === 'preview_ready' && onApprovePreview !== undefined && (
        <Button
          label="Önizlemeyi dinle ve onayla"
          variant="secondary"
          onPress={onApprovePreview}
        />
      )}

      {resultTr !== undefined && (
        <NoticeBox tone="info" titleTr="Ses silme başlatıldı" itemsTr={resultTr} />
      )}

      {/* ── Üç-nokta menüsü ─────────────────────────────────── */}
      <Sheet
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false);
        }}
        titleTr={profile.displayName}
      >
        {profile.preview !== undefined && (
          <Button
            label="Örneği dinle"
            variant="secondary"
            onPress={() => {
              setMenuOpen(false);
              playSample();
            }}
          />
        )}
        <Button
          label="Sesi sil"
          variant="danger"
          onPress={() => {
            setMenuOpen(false);
            setDeleteAck(false);
            deleteProfile.reset();
            setConfirmOpen(true);
          }}
        />
        <Button
          label="Vazgeç"
          variant="ghost"
          onPress={() => {
            setMenuOpen(false);
          }}
        />
      </Sheet>

      {/* ── Silme onayı — sonuçlar İŞLEMDEN ÖNCE gösterilir ── */}
      <Sheet
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
        }}
        titleTr={`${profile.displayName} sesini sil`}
      >
        <NoticeBox
          tone="danger"
          titleTr="Silerseniz ne olur?"
          itemsTr={[
            `${profile.displayName} ses profiliniz ve ${String(profile.storiesUsingCount)} hikayenin seslendirmesi silinecek.`,
            'Hikayeleriniz KALACAK; seslendirmeleri sistem sesine dönecek.',
            'Ham kayıtlarınız ses sağlayıcısından da silinecek.',
            'Bu işlem geri alınamaz; sesinizi yeniden kaydetmeniz gerekir.',
          ]}
        />
        <CheckRow labelTr="Sonuçları okudum ve anladım." checked={deleteAck} onChange={setDeleteAck} />
        <Button
          label="Sesi kalıcı olarak sil"
          variant="danger"
          disabled={!deleteAck}
          busy={deleteProfile.isPending}
          onPress={() => {
            deleteProfile.mutate(
              { voiceProfileId: profile.id as string },
              {
                onSuccess: ({ sideEffectsTr }) => {
                  setResultTr(sideEffectsTr);
                  setConfirmOpen(false);
                },
              },
            );
          }}
        />
        {deleteProfile.error !== null ? (
          <Text variant="caption" tone="danger">
            {deleteProfile.error.messageTr}
          </Text>
        ) : null}
        <Button
          label="Vazgeç"
          variant="secondary"
          onPress={() => {
            setConfirmOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  /* Figma: 16/18 dolgu · 18 yarıçap · 1 px kenarlık · yumuşak gölge. */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 24 },
  body: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 15, lineHeight: 20 },
  sub: { fontSize: 12, lineHeight: 16 },

  /* Figma "Hazır": #8DB89A metin, %15 zemin, 6 yarıçap, 2/8 dolgu, 10/700. */
  readyBadge: {
    backgroundColor: 'rgba(141, 184, 154, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  readyBadgeText: {
    color: palette.sage,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },

  actions: { flexDirection: 'row', gap: 8 },
  circleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
