import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import type { ApiError } from '@kendihikayem/contract';
import { Input, Text, useTheme } from '@kendihikayem/ui';

import { Body, Caption, Card, PrimaryButton, Screen, Title } from '../../components/ui';
import { ErrorBanner, SecondaryButton } from '../../features/onboarding/components';
import { isMockMode } from '../../lib/api';
import { startOtp, verifyOtp, type OtpChallenge } from '../../lib/session';

/**
 * S07 — Hızlı giriş, SMS OTP (~20 sn hedef, SPEC §11.2 2:05).
 *
 * The single promise this screen must land: "misafir oturumunuz birleşir,
 * hiçbir veri kaybolmaz". `verifyOtp` passes the guest token as
 * `mergeGuestToken`, so the promise is structural, not cosmetic.
 */
export default function Giris(): ReactNode {
  const router = useRouter();
  const { colors, radius, spacing, type } = useTheme();
  const { donus } = useLocalSearchParams<{ donus?: string }>();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | undefined>(undefined);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | undefined>(undefined);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => {
      setResendIn((value) => value - 1);
    }, 1_000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const normalizedPhone = normalizeTrPhone(phone);

  const sendCode = async (): Promise<void> => {
    if (normalizedPhone === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await startOtp(normalizedPhone);
      setChallenge(result);
      setResendIn(result.resendAfterSec);
      setCode('');
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (): Promise<void> => {
    if (challenge === undefined || code.length !== 6 || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await verifyOtp(challenge.challengeId, code);
      if (donus === 'olustur') {
        router.replace({ pathname: '/(onboarding)/ozet', params: { devam: '1' } });
      } else if (donus === 'sihirbaz') {
        router.replace('/(app)/sihirbaz');
      } else {
        router.replace('/(app)/kitaplik');
      }
    } catch (err) {
      setError(err as ApiError);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Telefonunuzu doğrulayalım</Title>
      <Body>
        {donus === 'olustur'
          ? 'Masalınız hazırlanmadan hemen önce tek bir adım kaldı. Doğrulama yaklaşık 20 saniye sürer.'
          : 'Numaranıza tek kullanımlık bir kod göndereceğiz.'}
      </Body>

      <Card>
        <Input
          label="Telefon numarası"
          autoComplete="tel"
          editable={challenge === undefined}
          keyboardType="phone-pad"
          maxLength={17}
          onChangeText={setPhone}
          placeholder="05xx xxx xx xx"
          value={phone}
        />
        {challenge === undefined ? (
          <PrimaryButton
            label={busy ? 'Kod gönderiliyor…' : 'Kod gönder'}
            disabled={normalizedPhone === undefined || busy}
            onPress={() => {
              void sendCode();
            }}
          />
        ) : (
          <>
            <Caption>{`Kod ${challenge.destinationMasked} numarasına gönderildi.`}</Caption>
            <TextInput
              accessibilityLabel="Doğrulama kodu"
              autoFocus
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => {
                setCode(value.replace(/\D/g, ''));
              }}
              placeholder="6 haneli kod"
              placeholderTextColor={colors.textDim}
              style={[
                type.body,
                styles.codeInput,
                {
                  color: colors.ink,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.md,
                },
              ]}
              value={code}
            />
            <PrimaryButton
              label={busy ? 'Doğrulanıyor…' : 'Doğrula ve devam et'}
              disabled={code.length !== 6 || busy}
              onPress={() => {
                void verify();
              }}
            />
            <SecondaryButton
              label={resendIn > 0 ? `Tekrar gönder (${String(resendIn)} sn)` : 'Kodu tekrar gönder'}
              disabled={resendIn > 0 || busy}
              onPress={() => {
                void sendCode();
              }}
            />
          </>
        )}
        {isMockMode() && <Caption>Demo ortamı: doğrulama kodu her zaman 123456.</Caption>}
      </Card>

      {error !== undefined && <ErrorBanner error={error} />}

      <Text variant="caption" tone="muted">
        Misafir olarak yaptığınız her şey — seçimleriniz, çocuk profili, krediler — bu hesapla
        birleşir. Hiçbir veri kaybolmaz.
      </Text>
    </Screen>
  );
}

/** '05321234567', '5321234567', '+905321234567' → '+905321234567'; else undefined. */
function normalizeTrPhone(raw: string): string | undefined {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+90\d{10}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return `+9${digits}`;
  if (/^5\d{9}$/.test(digits)) return `+90${digits}`;
  return undefined;
}

const styles = StyleSheet.create({
  codeInput: {
    borderWidth: 1,
    paddingVertical: 12,
    minHeight: 52,
    letterSpacing: 8,
    textAlign: 'center',
    fontWeight: '700',
  },
});
