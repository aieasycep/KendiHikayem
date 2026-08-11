import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import type { ApiError, VoiceScriptBundle } from '@kendihikayem/contract';

import { Body, Caption, Screen, Title } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../constants/theme';
import { AsyncGate } from '../../../features/onboarding/components';
import { useVoiceFlow } from '../../../features/voice/flow';
import { TakeRecorder } from '../../../features/voice/TakeRecorder';
import { api, asApiError, toApiError } from '../../../lib/api';

/**
 * V05 — Sesli rıza + canlılık (SPEC §7 adım 5).
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
    <Screen>
      <Title>Sesli onay</Title>
      <Body>
        Aşağıdaki iki cümleyi arka arkaya, doğal sesinizle okuyun (yaklaşık 12 saniye). İlk
        cümle her seferinde değişir — kaydın gerçekten şu an size ait olduğunu kanıtlar.
      </Body>

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
              <Caption>1 · Doğrulama cümlesi (her seferinde değişir)</Caption>
              <Text style={styles.scriptText}>{bundle.consentClip.randomSentenceTr}</Text>
              <View style={styles.divider} />
              <Caption>2 · Rıza beyanı</Caption>
              <Text style={styles.scriptText}>{bundle.consentClip.consentStatementTr}</Text>
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

      <Caption>
        Bu kayıt, izninizin sesli kanıtı olarak ayrı ve değiştirilemez biçimde saklanır; masal
        seslendirmesinde kullanılmaz.
      </Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scriptBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  scriptText: { ...typography.body, fontSize: 20, lineHeight: 30, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.border },
});
