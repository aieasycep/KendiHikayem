import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { possessive, validateGivenName } from '@kendihikayem/shared';

import { Body, Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../constants/theme';

/**
 * S01 + S02 — landing and "who is this for?".
 *
 * The name field is here on purpose: it is the fastest way to show a parent the one thing
 * no competitor gets right in Turkish — correct suffixes on their child's name.
 */
export default function Landing(): ReactNode {
  const router = useRouter();
  const [name, setName] = useState('');

  const validation = validateGivenName(name);
  const preview = validation.ok ? `${possessive(validation.normalized)} masalı` : null;

  return (
    <Screen>
      <Title>KendiHikayem</Title>
      <Body>
        Çocuğunuza özel bir masal yazalım, sizin sesinizle seslendirelim, isterseniz
        bastırıp elinize alalım.
      </Body>

      <Card>
        <Heading>Masal kimin için?</Heading>
        <TextInput
          accessibilityLabel="Çocuğun adı"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={30}
          onChangeText={setName}
          placeholder="Çocuğunuzun adı"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
          value={name}
        />
        {preview !== null ? (
          <View style={styles.previewBox}>
            <Caption>Türkçe ek denemesi</Caption>
            <Body>{preview}</Body>
          </View>
        ) : null}
        {name.length > 0 && !validation.ok ? (
          <Caption>{validation.messageTr ?? ''}</Caption>
        ) : null}
        <Caption>Çocuğunuzun fotoğrafını istemiyoruz. Hiçbir zaman.</Caption>
      </Card>

      <PrimaryButton
        label="Kitaplığa geç"
        onPress={() => {
          router.replace('/(app)/kitaplik');
        }}
      />
      <Caption>
        Bu ilk sürümde hesap açmanız gerekmiyor; içerik demo verisiyle gösterilir.
      </Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  previewBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
});
