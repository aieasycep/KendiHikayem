import { describe, expect, it } from 'vitest';

import { KARE21_24_SERT } from '../formats';
import { buildGhostscriptArgs, pdfX3OptionsForFormat } from './pdfx';

describe('Ghostscript PDF/X-3 komutu', () => {
  const options = pdfX3OptionsForFormat(KARE21_24_SERT, {
    ghostscriptPath: '/usr/bin/gs',
    iccProfilePath: '/profiles/ISOcoated_v2_eci.icc',
    pdfxDefPath: '/profiles/PDFX_def.ps',
    inputPath: '/tmp/interior.pdf',
    outputPath: '/tmp/interior-x3.pdf',
  });

  it('siyah metni tek mürekkepte tutar (-dDeviceGrayToK)', () => {
    // Bu bayrak olmazsa siyah metin dört renkten kurulur ve baskıda kayar.
    expect(buildGhostscriptArgs(options)).toContain('-dDeviceGrayToK=true');
  });

  it('CMYK dönüşümünü matbaanın ICC profiliyle yapar', () => {
    const args = buildGhostscriptArgs(options);
    expect(args).toContain('-sColorConversionStrategy=CMYK');
    expect(args).toContain('-sOutputICCProfile=/profiles/ISOcoated_v2_eci.icc');
    expect(args).toContain('-dOverrideICC=true');
  });

  it('TrimBox ofsetini formatın taşma payından türetir (5 mm = 14,17 pt)', () => {
    const args = buildGhostscriptArgs(options);
    const offset = args.find((arg) => arg.startsWith('-dPDFXTrimBoxToMediaBoxOffset'));
    expect(offset).toBe('-dPDFXTrimBoxToMediaBoxOffset=[14.17 14.17 14.17 14.17]');
  });

  it('PDFX_def.ps girdi dosyasından ÖNCE gelir — sıra bozulursa gs sessizce X üretmez', () => {
    const args = buildGhostscriptArgs(options);
    expect(args.indexOf('/profiles/PDFX_def.ps')).toBeLessThan(args.indexOf('/tmp/interior.pdf'));
    expect(args.at(-1)).toBe('/tmp/interior.pdf');
  });
});
