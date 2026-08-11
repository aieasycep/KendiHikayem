/**
 * A02 Gizlilik ve İzinler.
 *
 * HUKUKİ AKIŞ (SPEC §11.1 A02 + Apple 5.1.1(ii)):
 *  1. Kullanıcı "geri al" der → ÖNCE `GET /consents/:subject/side-effects`
 *     çekilir ve `sideEffectsTr` AYNEN gösterilir:
 *     "Anne ses profiliniz ve 4 hikayenin sesi silinecek. Hikayeler kalacak,
 *      sistem sesine dönecek."
 *  2. Kullanıcı sonuçları okuduğunu işaretler (ön-işaretsiz kutu).
 *  3. Ancak o zaman `DELETE /consents/:subject` çağrılır
 *     (`sideEffectsAcknowledged: true` literal'ı).
 */

import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { View } from 'react-native';

import type { ConsentStateSubject } from '@kendihikayem/contract';
import {
  Badge,
  Button,
  Card,
  CheckRow,
  ErrorState,
  ListRow,
  NoticeBox,
  Sheet,
  Skeleton,
  Text,
} from '@kendihikayem/ui';

import { useConsents, useConsentSideEffects, useGrantConsent, useRevokeConsent } from './hooks';

const SUBJECT_META: Record<
  ConsentStateSubject,
  { titleTr: string; subtitleTr: string; icon: string }
> = {
  ses_biyometrik: {
    titleTr: 'Ses verisi (biyometrik)',
    subtitleTr: 'Sesinizin klonlanması için işlenmesi.',
    icon: '🎙',
  },
  yurtdisi_aktarim: {
    titleTr: 'Yurt dışına aktarım',
    subtitleTr: 'Ses modelinin ABD altyapısında üretilmesi.',
    icon: '🌍',
  },
  cocuk_verisi: {
    titleTr: 'Çocuk bilgileri',
    subtitleTr: 'Ad, yaş bandı ve karakter seçimleri. Fotoğraf asla istenmez.',
    icon: '🧒',
  },
  pazarlama: {
    titleTr: 'Pazarlama izni',
    subtitleTr: 'Kampanya bildirimleri ve e-postaları.',
    icon: '📣',
  },
};

function formatDateTr(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function GizlilikSection(): ReactElement {
  const router = useRouter();
  const consentsQuery = useConsents();
  const [revokeSubject, setRevokeSubject] = useState<ConsentStateSubject | undefined>(undefined);
  const [acknowledged, setAcknowledged] = useState(false);
  const [resultTr, setResultTr] = useState<string[] | undefined>(undefined);

  const sideEffects = useConsentSideEffects(revokeSubject);
  const revoke = useRevokeConsent();
  const grant = useGrantConsent();

  const consents = consentsQuery.data;

  const openRevoke = (subject: ConsentStateSubject): void => {
    setAcknowledged(false);
    setResultTr(undefined);
    revoke.reset();
    setRevokeSubject(subject);
  };

  if (consentsQuery.isLoading) {
    return (
      <View style={{ gap: 12 }}>
        <Skeleton height={80} rounded />
        <Skeleton height={80} rounded />
        <Skeleton height={80} rounded />
      </View>
    );
  }

  if (consents === undefined) {
    return (
      <ErrorState
        messageTr={consentsQuery.error?.messageTr}
        onRetry={() => {
          void consentsQuery.refetch();
        }}
      />
    );
  }

  const renderRow = (subject: ConsentStateSubject): ReactElement => {
    const meta = SUBJECT_META[subject];
    const status = consents[subject];
    return (
      <Card key={subject}>
        <ListRow titleTr={meta.titleTr} subtitleTr={meta.subtitleTr} icon={meta.icon} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Badge
            labelTr={
              status.granted
                ? `İzin verildi${formatDateTr(status.grantedAt) !== undefined ? ` · ${formatDateTr(status.grantedAt)}` : ''}`
                : 'İzin verilmedi'
            }
            tone={status.granted ? 'success' : 'neutral'}
          />
          {status.needsRenewal ? <Badge labelTr="Metin güncellendi — yenileyin" tone="warning" /> : null}
        </View>
        {status.granted ? (
          <Button
            label="İzni geri al"
            variant="danger"
            compact
            onPress={() => {
              openRevoke(subject);
            }}
          />
        ) : subject === 'pazarlama' ? (
          <Button
            label="İzin ver"
            variant="secondary"
            compact
            busy={grant.isPending}
            onPress={() => {
              grant.mutate({ subject: 'pazarlama', granted: true });
            }}
          />
        ) : subject === 'ses_biyometrik' || subject === 'yurtdisi_aktarim' ? (
          <Button
            label="Ses izinleri akışına git"
            variant="secondary"
            compact
            onPress={() => {
              router.push('/(app)/ses');
            }}
          />
        ) : null}
      </Card>
    );
  };

  return (
    <View style={{ gap: 12 }}>
      <NoticeBox
        titleTr="Sözümüz"
        bodyTr="Çocuğunuzun fotoğrafını hiçbir zaman istemiyoruz, sesini asla kaydetmiyoruz. Her izni tek dokunuşla geri alabilirsiniz; geri almanın sonuçları işlemden ÖNCE gösterilir."
      />
      {(Object.keys(SUBJECT_META) as ConsentStateSubject[]).map(renderRow)}
      {resultTr !== undefined ? (
        <NoticeBox tone="info" titleTr="İzin geri alındı" itemsTr={resultTr} />
      ) : null}

      {/* ── Geri alma onay sayfası ─────────────────────────── */}
      <Sheet
        open={revokeSubject !== undefined}
        onClose={() => {
          setRevokeSubject(undefined);
        }}
        titleTr={revokeSubject !== undefined ? `${SUBJECT_META[revokeSubject].titleTr} — geri al` : ''}
      >
        {sideEffects.isLoading ? (
          <Skeleton height={120} rounded />
        ) : sideEffects.data !== undefined ? (
          <>
            <NoticeBox
              tone={sideEffects.data.irreversible ? 'danger' : 'legal'}
              titleTr="Geri alırsanız ne olur?"
              itemsTr={sideEffects.data.sideEffectsTr}
            />
            {sideEffects.data.irreversible ? (
              <Text variant="caption" tone="danger">
                Bu işlem geri alınamaz.
              </Text>
            ) : null}
            <CheckRow
              labelTr="Sonuçları okudum ve anladım."
              checked={acknowledged}
              onChange={setAcknowledged}
            />
            <Button
              label="İzni geri al"
              variant="danger"
              disabled={!acknowledged}
              busy={revoke.isPending}
              onPress={() => {
                if (revokeSubject === undefined) return;
                revoke.mutate(
                  { subject: revokeSubject },
                  {
                    onSuccess: ({ sideEffectsTr }) => {
                      setResultTr(sideEffectsTr);
                      setRevokeSubject(undefined);
                    },
                  },
                );
              }}
            />
            {revoke.error !== null ? (
              <Text variant="caption" tone="danger">
                {revoke.error.messageTr}
              </Text>
            ) : null}
          </>
        ) : (
          <ErrorState
            compact
            messageTr={sideEffects.error?.messageTr}
            onRetry={() => {
              void sideEffects.refetch();
            }}
          />
        )}
        <Button
          label="Vazgeç"
          variant="secondary"
          onPress={() => {
            setRevokeSubject(undefined);
          }}
        />
      </Sheet>
    </View>
  );
}
