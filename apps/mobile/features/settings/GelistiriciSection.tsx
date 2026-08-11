/**
 * Gizli geliştirici bölümü — mock senaryosu ÇALIŞMA ANINDA değiştirilir.
 *
 * APK'yı elinde tutan test kullanıcısı yeniden derleme yapmadan şunları dener:
 * kredi bitmesi (402), rıza eksikliği (403), sağlayıcı arızası, gürültülü kayıt,
 * maliyet tavanı, kararsız ağ. Ayrıca gecikme ve iş hızı ayarlanabilir, mock
 * deposu ilk gününe döndürülebilir.
 *
 * `@kendihikayem/mock` BİLEREK dinamik import edilir: live modda msw paketi
 * çözümlense bile senaryo düğmelerine basılana kadar yüklenmez (F1'in
 * lib/mock.ts kalıbıyla aynı disiplin).
 */

import { useState, type ReactElement } from 'react';
import { View } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { Card, Chip, NoticeBox, Row, Text } from '@kendihikayem/ui';

import { API_MODE, apiModeLabelTr } from '../../lib/api';

type ScenarioCode =
  | 'mutlu_yol'
  | 'kredi_yok'
  | 'riza_yok'
  | 'saglayici_arizasi'
  | 'gurultulu_kayit'
  | 'maliyet_tavani'
  | 'kararsiz_ag';

const SCENARIOS: Array<{ code: ScenarioCode; labelTr: string }> = [
  { code: 'mutlu_yol', labelTr: 'Mutlu yol' },
  { code: 'kredi_yok', labelTr: 'Kredi yok (402)' },
  { code: 'riza_yok', labelTr: 'Rıza yok (403)' },
  { code: 'saglayici_arizasi', labelTr: 'Sağlayıcı arızası' },
  { code: 'gurultulu_kayit', labelTr: 'Gürültülü kayıt' },
  { code: 'maliyet_tavani', labelTr: 'Maliyet tavanı' },
  { code: 'kararsiz_ag', labelTr: 'Kararsız ağ (503)' },
];

const LATENCIES: Array<{ labelTr: string; value: number | [number, number] }> = [
  { labelTr: 'Anında', value: 0 },
  { labelTr: 'Gerçekçi', value: [120, 380] },
  { labelTr: 'Yavaş ağ', value: [900, 2200] },
];

const JOB_SPEEDS: Array<{ labelTr: string; value: number }> = [
  { labelTr: 'Gerçek hız', value: 1 },
  { labelTr: '2×', value: 2 },
  { labelTr: '12×', value: 12 },
  { labelTr: '50×', value: 50 },
];

export function GelistiriciSection(): ReactElement {
  const queryClient = useQueryClient();
  const [scenario, setScenario] = useState<ScenarioCode>('mutlu_yol');
  const [latencyIndex, setLatencyIndex] = useState(1);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [noteTr, setNoteTr] = useState<string | undefined>(undefined);

  const applyMock = async (
    patch: Partial<{
      scenario: ScenarioCode;
      latencyMs: number | [number, number];
      jobSpeed: number;
    }>,
  ): Promise<void> => {
    const { configureMock } = await import('@kendihikayem/mock');
    configureMock(patch);
    setNoteTr('Ayar uygulandı — bir sonraki istekten itibaren geçerli.');
  };

  if (API_MODE !== 'mock') {
    return (
      <NoticeBox
        titleTr="Geliştirici bölümü"
        bodyTr={`Uygulama canlı API modunda (${apiModeLabelTr()}); mock senaryoları yalnızca demo derlemesinde kullanılabilir.`}
      />
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <NoticeBox
        titleTr="Test senaryoları"
        bodyTr="Uygulama sahte veriyle çalışıyor. Buradan hata senaryolarını açıp ekranların nasıl davrandığını görebilirsiniz. Ayarlar uygulamayı yeniden başlatana kadar geçerlidir."
      />

      <Card>
        <Text variant="bodyStrong">Senaryo</Text>
        <Row gap="sm" wrap>
          {SCENARIOS.map((item) => (
            <Chip
              key={item.code}
              label={item.labelTr}
              selected={scenario === item.code}
              onPress={() => {
                setScenario(item.code);
                void applyMock({ scenario: item.code });
              }}
            />
          ))}
        </Row>
      </Card>

      <Card>
        <Text variant="bodyStrong">Ağ gecikmesi</Text>
        <Row gap="sm" wrap>
          {LATENCIES.map((item, index) => (
            <Chip
              key={item.labelTr}
              label={item.labelTr}
              selected={latencyIndex === index}
              onPress={() => {
                setLatencyIndex(index);
                void applyMock({ latencyMs: item.value });
              }}
            />
          ))}
        </Row>
      </Card>

      <Card>
        <Text variant="bodyStrong">Uzun iş hızı</Text>
        <Text variant="caption" tone="muted">
          Gerçek hızda iskelet ~18 sn, dolgu ~90 sn sürer; 12× demo için idealdir.
        </Text>
        <Row gap="sm" wrap>
          {JOB_SPEEDS.map((item, index) => (
            <Chip
              key={item.labelTr}
              label={item.labelTr}
              selected={speedIndex === index}
              onPress={() => {
                setSpeedIndex(index);
                void applyMock({ jobSpeed: item.value });
              }}
            />
          ))}
        </Row>
      </Card>

      <Card
        onPress={() => {
          void (async () => {
            const { resetStore, resetMockConfig } = await import('@kendihikayem/mock');
            resetStore();
            resetMockConfig();
            setScenario('mutlu_yol');
            setLatencyIndex(1);
            setSpeedIndex(1);
            queryClient.clear();
            setNoteTr('Mock deposu ve tüm önbellek ilk güne döndü.');
          })();
        }}
      >
        <Text variant="bodyStrong" tone="danger">
          Mock deposunu sıfırla
        </Text>
        <Text variant="caption" tone="muted">
          Oluşturduğunuz hikayeler silinir, örnek veriler geri gelir, ekran önbelleği temizlenir.
        </Text>
      </Card>

      <Card>
        <Text variant="caption" tone="muted">{`Veri kaynağı: ${apiModeLabelTr()}`}</Text>
        <Text variant="caption" tone="muted">
          Mock OTP kodu: 123456
        </Text>
      </Card>

      {noteTr !== undefined ? (
        <Text variant="caption" tone="success">
          {noteTr}
        </Text>
      ) : null}
    </View>
  );
}
