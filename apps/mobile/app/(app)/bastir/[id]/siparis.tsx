import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatTryTr, type ShippingAddress } from '@kendihikayem/contract';
import {
  Button,
  Card,
  CheckRow,
  Chip,
  Input,
  NoticeBox,
  Row,
  Screen,
  Text,
  useTheme,
} from '@kendihikayem/ui';

import { useCreateOrder, useQuote } from '../../../../features/print/hooks';

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const POSTAL_PATTERN = /^\d{5}$/;

interface AddressDraft {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  district: string;
  city: string;
  postalCode: string;
}

const EMPTY_ADDRESS: AddressDraft = {
  recipientName: '',
  phone: '+90',
  addressLine1: '',
  addressLine2: '',
  district: '',
  city: '',
  postalCode: '',
};

function validate(draft: AddressDraft): Partial<Record<keyof AddressDraft, string>> {
  const errors: Partial<Record<keyof AddressDraft, string>> = {};
  if (draft.recipientName.trim().length < 2) errors.recipientName = 'Alıcının adını ve soyadını yazın.';
  if (!PHONE_PATTERN.test(draft.phone.trim()))
    errors.phone = 'Telefonu +90 ile başlayan biçimde yazın (örn. +905321234567).';
  if (draft.addressLine1.trim().length < 5) errors.addressLine1 = 'Mahalle, sokak ve kapı numarasını yazın.';
  if (draft.district.trim().length < 2) errors.district = 'İlçenizi yazın.';
  if (draft.city.trim().length < 2) errors.city = 'İlinizi yazın.';
  if (draft.postalCode.trim().length > 0 && !POSTAL_PATTERN.test(draft.postalCode.trim()))
    errors.postalCode = 'Posta kodu 5 rakam olmalı; bilmiyorsanız boş bırakın.';
  return errors;
}

/**
 * B05 adet + adres, B06 özet + CAYMA HAKKI.
 *
 * 6502: cayma metni (`withdrawalNoticeTr`) tekliften geldiği gibi, AYRI ve büyük
 * bir kutuda basılır; ön-işaretsiz onay kutusu işaretlenmeden ödeme düğmesi
 * PASİF kalır. Onaylanan belge kimlikleri siparişe aynen yazılır.
 */
export default function Siparis(): ReactNode {
  const { id, buildId } = useLocalSearchParams<{ id: string; buildId: string }>();
  const router = useRouter();
  const { colors, radius } = useTheme();

  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [touched, setTouched] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [installment, setInstallment] = useState(1);
  const [giftNote, setGiftNote] = useState('');

  const quote = useQuote();
  const createOrder = useCreateOrder();

  const errors = validate(address);
  const addressValid = Object.keys(errors).length === 0;
  const quoteData = quote.data;

  const set = (key: keyof AddressDraft, value: string): void => {
    setAddress((current) => ({ ...current, [key]: value }));
    /* Adres değişti → eski teklif ve onay geçersiz. */
    if (key === 'city' || key === 'district') {
      quote.reset();
      setWaiverAccepted(false);
    }
  };

  const requestQuote = (): void => {
    setTouched(true);
    if (!addressValid || buildId === undefined) return;
    setWaiverAccepted(false);
    quote.mutate({
      buildId,
      quantity,
      city: address.city.trim(),
      district: address.district.trim(),
    });
  };

  const canPay = quoteData !== undefined && waiverAccepted && addressValid && !createOrder.isPending;

  return (
    <Screen>
      <Text variant="title">Sipariş</Text>

      {/* ── Adet ───────────────────────────────────────────── */}
      <Card>
        <Row justify="space-between">
          <Text variant="bodyStrong">Adet</Text>
          <Row gap="md">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Adedi azalt"
              disabled={quantity <= 1}
              onPress={() => {
                setQuantity((q) => Math.max(1, q - 1));
                quote.reset();
                setWaiverAccepted(false);
              }}
              style={[
                styles.stepButton,
                { borderColor: colors.border, borderRadius: radius.pill, opacity: quantity <= 1 ? 0.4 : 1 },
              ]}
            >
              <Text variant="heading">−</Text>
            </Pressable>
            <Text variant="title">{quantity}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Adedi artır"
              disabled={quantity >= 20}
              onPress={() => {
                setQuantity((q) => Math.min(20, q + 1));
                quote.reset();
                setWaiverAccepted(false);
              }}
              style={[
                styles.stepButton,
                { borderColor: colors.border, borderRadius: radius.pill, opacity: quantity >= 20 ? 0.4 : 1 },
              ]}
            >
              <Text variant="heading">+</Text>
            </Pressable>
          </Row>
        </Row>
        <Text variant="caption" tone="muted">
          Aynı kitaptan büyükanneye, anneanneye de… En çok 20 adet.
        </Text>
      </Card>

      {/* ── Adres ──────────────────────────────────────────── */}
      <Text variant="heading">Teslimat adresi</Text>
      <Input
        label="Alıcı adı soyadı"
        value={address.recipientName}
        onChangeText={(v) => {
          set('recipientName', v);
        }}
        errorTr={touched ? errors.recipientName : undefined}
        autoComplete="name"
      />
      <Input
        label="Telefon"
        value={address.phone}
        onChangeText={(v) => {
          set('phone', v);
        }}
        errorTr={touched ? errors.phone : undefined}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Input
        label="Adres"
        value={address.addressLine1}
        onChangeText={(v) => {
          set('addressLine1', v);
        }}
        errorTr={touched ? errors.addressLine1 : undefined}
        placeholder="Mahalle, sokak, bina ve daire no"
        multiline
      />
      <Input
        label="Adres 2. satır (isteğe bağlı)"
        value={address.addressLine2}
        onChangeText={(v) => {
          set('addressLine2', v);
        }}
      />
      <Row gap="sm">
        <View style={styles.flex1}>
          <Input
            label="İlçe"
            value={address.district}
            onChangeText={(v) => {
              set('district', v);
            }}
            errorTr={touched ? errors.district : undefined}
          />
        </View>
        <View style={styles.flex1}>
          <Input
            label="İl"
            value={address.city}
            onChangeText={(v) => {
              set('city', v);
            }}
            errorTr={touched ? errors.city : undefined}
          />
        </View>
      </Row>
      <Input
        label="Posta kodu (isteğe bağlı)"
        value={address.postalCode}
        onChangeText={(v) => {
          set('postalCode', v);
        }}
        errorTr={touched ? errors.postalCode : undefined}
        keyboardType="number-pad"
      />
      <Input
        label="Hediye notu (isteğe bağlı)"
        value={giftNote}
        onChangeText={setGiftNote}
        maxLength={200}
        placeholder="Paketin üstüne eklenecek kısa not"
      />

      {quoteData === undefined ? (
        <Button label="Fiyat teklifi al" busy={quote.isPending} onPress={requestQuote} />
      ) : null}
      {quote.error !== null ? (
        <NoticeBox tone="danger" titleTr="Teklif alınamadı" bodyTr={quote.error.messageTr} />
      ) : null}

      {/* ── B06 Özet + CAYMA HAKKI ─────────────────────────── */}
      {quoteData !== undefined ? (
        <>
          <Text variant="heading">Özet</Text>
          <Card>
            <Row justify="space-between">
              <Text variant="body">{`Kitap × ${quantity}`}</Text>
              <Text variant="body">{formatTryTr((quoteData.unitPriceTry as number) * quantity)}</Text>
            </Row>
            <Row justify="space-between">
              <Text variant="body">Kargo</Text>
              <Text variant="body">{formatTryTr(quoteData.shippingTry as number)}</Text>
            </Row>
            {(quoteData.discountTry as number) > 0 ? (
              <Row justify="space-between">
                <Text variant="body" tone="success">
                  İndirim
                </Text>
                <Text variant="body" tone="success">
                  {`−${formatTryTr(quoteData.discountTry as number)}`}
                </Text>
              </Row>
            ) : null}
            <Row justify="space-between">
              <Text variant="bodyStrong">Toplam</Text>
              <Text variant="bodyStrong" tone="accent">
                {formatTryTr(quoteData.totalTry as number)}
              </Text>
            </Row>
            <Text variant="caption" tone="muted">
              {`Tahmini teslim: ${quoteData.etaBusinessDays[0]}–${quoteData.etaBusinessDays[1]} iş günü`}
            </Text>
          </Card>

          {quoteData.installmentOptions.length > 1 ? (
            <Card>
              <Text variant="bodyStrong">Taksit</Text>
              <Row gap="sm" wrap>
                {quoteData.installmentOptions.map((option) => (
                  <Chip
                    key={option.count}
                    label={
                      option.count === 1
                        ? `Tek çekim ${formatTryTr(option.totalTry as number)}`
                        : `${option.count} × ${formatTryTr(option.monthlyTry as number)}`
                    }
                    selected={installment === option.count}
                    onPress={() => {
                      setInstallment(option.count);
                    }}
                  />
                ))}
              </Row>
            </Card>
          ) : null}

          {/* CAYMA HAKKI — birebir, ayrı, büyük kutu (6502). */}
          <NoticeBox tone="legal" titleTr="Cayma hakkı bilgilendirmesi" bodyTr={quoteData.withdrawalNoticeTr}>
            <CheckRow
              labelTr="Okudum ve anladım: Bu kitap bana özel üretildiği için cayma hakkımın olmadığını kabul ediyorum."
              checked={waiverAccepted}
              onChange={setWaiverAccepted}
              testID="cayma-onayi"
            />
          </NoticeBox>

          <Button
            label={`Ödemeye geç — ${formatTryTr(
              (quoteData.installmentOptions.find((o) => o.count === installment)?.totalTry ??
                quoteData.totalTry) as number,
            )}`}
            disabled={!canPay}
            busy={createOrder.isPending}
            onPress={() => {
              if (quoteData === undefined) return;
              const shipping: ShippingAddress = {
                recipientName: address.recipientName.trim(),
                phone: address.phone.trim(),
                addressLine1: address.addressLine1.trim(),
                ...(address.addressLine2.trim().length > 0
                  ? { addressLine2: address.addressLine2.trim() }
                  : {}),
                district: address.district.trim(),
                city: address.city.trim(),
                ...(address.postalCode.trim().length > 0
                  ? { postalCode: address.postalCode.trim() }
                  : {}),
              };
              createOrder.mutate(
                {
                  buildId: buildId ?? '',
                  quantity,
                  shipping,
                  giftNoteTr: giftNote.trim(),
                  quote: quoteData,
                  installment,
                },
                {
                  onSuccess: ({ order, paymentUrl }) => {
                    /* iyzico sayfası tarayıcıda açılır; dönüş derin bağlantıyla. */
                    void Linking.openURL(paymentUrl).catch(() => undefined);
                    router.replace({
                      pathname: '/(app)/bastir/[id]/takip',
                      params: { id: id ?? '', orderId: order.id as string },
                    });
                  },
                },
              );
            }}
          />
          {!waiverAccepted ? (
            <Text variant="caption" tone="muted" center>
              Ödeme düğmesi, cayma hakkı bilgilendirmesini onaylamanızla açılır.
            </Text>
          ) : null}
          {createOrder.error !== null ? (
            <NoticeBox tone="danger" titleTr="Sipariş oluşturulamadı" bodyTr={createOrder.error.messageTr} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  stepButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
