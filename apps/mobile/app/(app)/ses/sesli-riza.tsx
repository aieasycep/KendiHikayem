import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import type { ApiError, VoiceScriptBundle } from '@kendihikayem/contract';
import { Text } from '@kendihikayem/ui';

import { AsyncGate } from '../../../features/onboarding/components';
import { useVoiceFlow } from '../../../features/voice/flow';
import { TakeRecorder } from '../../../features/voice/TakeRecorder';
import { NightHeader, NightScreen } from '../../../features/wizard/NightFlow';
import { api, asApiError, toApiError } from '../../../lib/api';

/**
 * V05 — Sesli rıza + canlılık (SPEC §7 adım 5). Kayıt stüdyosu buradan itibaren
 * gece temasındadır (Figma `VoiceStudio` kayıt ekranı): degrade gökyüzü,
 * yarı saydam metin kartı, mercan kayıt düğmesi.
 *
 * The script comes from the SERVER: a random one-time sentence (liveness proof —
 * a replayed recording cannot contain it) + the formal consent statement.
 * TTL 15 minutes, single use. In-app microphone ONLY — no upload path exists.
 * This clip is stored with `retention_class='legal_hold_10y'` server-side.
 */
export default function SesliRiza(): ReactNode {
  const router = useRouter();
  const flow = useVoiceFlow();
  const profileId = flow.state.profileId;

  useEffect(() => {
    if (profileId === undefined) router.replace('/(app)/ses/deger');
  }, [profileId, router]);

  const script = useQuery<VoiceScriptBundle, ApiError>({
    queryKey: ['voiceScript', profileId],
    enabled: profileId !== undefined,
    // TTL'li tek kullanımlık metin: cache'ten asla eski script dönmesin.
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      try {
        const res = await api().voice.script({ params: { voiceProfileId: profileId ?? '' } });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });

  // `setScript` is identity-stable (VoiceFlowProvider useCallback), so this
  // effect runs exactly once per fetched script — no loop, no suppression.
  const { setScript } = flow;
  useEffect(() => {
    if (script.data !== undefined) setScript(script.data);
  }, [script.data, setScript]);

  return (
    <NightScreen scroll testID="sesli-riza">
      <NightHeader
        kickerTr="Ses Kaydı"
        titleTr="Sesli onay"
        onBack={() => {
          router.back();
        }}
      />
      <Text variant="body" style={styles.lead}>
        Aşağıdaki iki cümleyi arka arkaya, doğal sesinizle okuyun (yaklaşık 12 saniye). İlk
        cümle her seferinde değişir — kaydın gerçekten şu an size ait olduğunu kanıtlar.
      </Text>

      <AsyncGate
        isLoading={script.isLoading}
        error={script.error}
        data={script.data}
        onRetry={() => void script.refetch()}
        loadingTr="Okuma metniniz hazırlanıyor…"
      >
        {(bundle) => (
          <>
            <View style={styles.scriptBox}>
              <Text variant="caption" style={styles.scriptKicker}>
                1 · DOĞRULAMA CÜMLESİ (HER SEFERİNDE DEĞİŞİR)
              </Text>
              <Text variant="body" style={styles.scriptText}>
                {bundle.consentClip.randomSentenceTr}
              </Text>
              <View style={styles.divider} />
              <Text variant="caption" style={styles.scriptKicker}>
                2 · RIZA BEYANI
              </Text>
              <Text variant="body" style={styles.scriptText}>
                {bundle.consentClip.consentStatementTr}
              </Text>
            </View>

            {profileId !== undefined && (
              <TakeRecorder
                profileId={profileId}
                scriptId={bundle.scriptId as string}
                step="consent_clip"
                targetSec={bundle.consentClip.targetSec}
                maxSec={30}
                onResult={(result) => {
                  flow.recordTake('consent_clip', result);
                }}
                onAccepted={() => {
                  router.push('/(app)/ses/pasaj/1');
                }}
                acceptedLabelTr="Pasajlara geç"
              />
            )}
          </>
        )}
      </AsyncGate>

      <Text variant="caption" style={styles.footnote}>
        Bu kayıt, izninizin sesli kanıtı olarak ayrı ve değiştirilemez biçimde saklanır; masal
        seslendirmesinde kullanılmaz.
      </Text>
    </NightScreen>
  );
}

const styles = StyleSheet.create({
  lead: { color: 'rgba(232,224,212,0.9)' },

  scriptBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  scriptKicker: {
    color: 'rgba(176,156,224,0.8)',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  scriptText: { color: 'rgba(255,255,255,0.92)', fontSize: 20, lineHeight: 32 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },

  footnote: { color: 'rgba(255,255,255,0.45)' },
});
