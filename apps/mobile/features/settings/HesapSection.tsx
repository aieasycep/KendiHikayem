/**
 * A01 Hesap — profil bilgisi, pazarlama izni, kredi bakiyesi ve hareketleri.
 * Telefon numarası maskeli gelir ve maskeli gösterilir; tam numara istemciye
 * hiç inmez (contract/auth.ts).
 */

import { useState, type ReactElement } from 'react';
import { View } from 'react-native';

import {
  Button,
  Card,
  ErrorState,
  Input,
  ListRow,
  Row,
  Skeleton,
  Text,
} from '@kendihikayem/ui';

import { useCredits, useMe, useUpdateMe } from './hooks';

function formatDateTr(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function HesapSection(): ReactElement {
  const meQuery = useMe();
  const creditsQuery = useCredits();
  const updateMe = useUpdateMe();

  const me = meQuery.data;
  const [nameDraft, setNameDraft] = useState<string | undefined>(undefined);

  if (meQuery.isLoading) {
    return (
      <View style={{ gap: 12 }}>
        <Skeleton height={96} rounded />
        <Skeleton height={200} rounded />
      </View>
    );
  }

  if (me === undefined) {
    return (
      <ErrorState
        messageTr={meQuery.error?.messageTr}
        onRetry={() => {
          void meQuery.refetch();
        }}
      />
    );
  }

  const name = nameDraft ?? me.displayName ?? '';

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Input
          label="Görünen ad"
          value={name}
          onChangeText={setNameDraft}
          autoComplete="name"
        />
        {nameDraft !== undefined && nameDraft.trim() !== (me.displayName ?? '') ? (
          <Button
            label="Adı kaydet"
            compact
            busy={updateMe.isPending}
            onPress={() => {
              updateMe.mutate(
                { displayName: nameDraft.trim() },
                {
                  onSuccess: () => {
                    setNameDraft(undefined);
                  },
                },
              );
            }}
          />
        ) : null}
        <ListRow titleTr="Telefon" valueTr={me.phoneMasked ?? '—'} icon="📱" />
        <ListRow titleTr="Paket" valueTr={me.entitlements.planCode} icon="🎟" />
        <ListRow
          titleTr="Kampanya iletileri"
          subtitleTr="Yeni özellik ve indirim duyuruları (İYS kaydı güncellenir)."
          switchValue={me.marketingOptIn}
          onSwitchChange={(value) => {
            updateMe.mutate({ marketingOptIn: value });
          }}
          icon="📣"
        />
        {updateMe.error !== null ? (
          <Text variant="caption" tone="danger">
            {updateMe.error.messageTr}
          </Text>
        ) : null}
      </Card>

      <Text variant="heading">Krediler</Text>
      {creditsQuery.isLoading ? (
        <Skeleton height={160} rounded />
      ) : creditsQuery.isError ? (
        <ErrorState
          compact
          messageTr={creditsQuery.error.messageTr}
          onRetry={() => {
            void creditsQuery.refetch();
          }}
        />
      ) : (
        <Card>
          <Row justify="space-between">
            <Text variant="bodyStrong">Bakiye</Text>
            <Text variant="title" tone="accent">
              {`${creditsQuery.data?.balance ?? 0} kredi`}
            </Text>
          </Row>
          {(creditsQuery.data?.entries ?? []).slice(0, 8).map((entry) => (
            <Row key={entry.id} justify="space-between" align="flex-start">
              <View style={{ flex: 1 }}>
                <Text variant="caption">{entry.reasonTr}</Text>
                <Text variant="caption" tone="muted">
                  {formatDateTr(entry.at)}
                </Text>
              </View>
              <Text variant="label" tone={entry.delta > 0 ? 'success' : 'muted'}>
                {entry.delta > 0 ? `+${entry.delta}` : `${entry.delta}`}
              </Text>
            </Row>
          ))}
        </Card>
      )}
    </View>
  );
}
