import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';
import { colors } from '../lib/theme';

export type MeasurementField =
  | 'heightCm'
  | 'bustCm'
  | 'waistCm'
  | 'hipCm'
  | 'shoulderCm'
  | 'sleeveLengthCm'
  | 'fullLengthCm'
  | 'wristCm';

const BODY =
  'M84 54 L64 64 Q54 110 42 194 L56 198 Q66 150 72 112 Q66 230 56 340 L144 340 Q134 230 128 112 Q134 150 144 198 L158 194 Q146 110 136 64 L116 54 Q100 62 84 54 Z';

/** A simple silhouette with the measured line highlighted in the accent colour. */
export function MeasurementDiagram({ field, size = 220 }: { field: MeasurementField; size?: number }) {
  const hi = colors.accent['500'];
  const stroke = { stroke: hi, strokeWidth: 3, strokeLinecap: 'round' as const };
  const dashed = { ...stroke, strokeDasharray: '6 4' };

  return (
    <Svg width={size * (200 / 360)} height={size} viewBox="0 0 200 360" accessibilityElementsHidden>
      <Circle cx={100} cy={32} r={18} fill={colors.neutral['200']} />
      <Path d={BODY} fill={colors.neutral['100']} stroke={colors.neutral['400']} strokeWidth={1.5} />

      {field === 'heightCm' ? (
        <>
          <Line x1={182} y1={14} x2={182} y2={340} {...stroke} />
          <Line x1={174} y1={14} x2={190} y2={14} {...stroke} />
          <Line x1={174} y1={340} x2={190} y2={340} {...stroke} />
        </>
      ) : null}
      {field === 'shoulderCm' ? <Line x1={64} y1={64} x2={136} y2={64} {...stroke} /> : null}
      {field === 'bustCm' ? <Ellipse cx={100} cy={100} rx={32} ry={7} fill="none" {...dashed} /> : null}
      {field === 'waistCm' ? <Ellipse cx={100} cy={142} rx={29} ry={6} fill="none" {...dashed} /> : null}
      {field === 'hipCm' ? <Ellipse cx={100} cy={182} rx={35} ry={7} fill="none" {...dashed} /> : null}
      {field === 'sleeveLengthCm' ? <Line x1={136} y1={66} x2={152} y2={194} {...stroke} /> : null}
      {field === 'fullLengthCm' ? (
        <>
          <Line x1={112} y1={58} x2={112} y2={340} {...stroke} />
          <Line x1={104} y1={340} x2={120} y2={340} {...stroke} />
        </>
      ) : null}
      {field === 'wristCm' ? <Ellipse cx={151} cy={196} rx={10} ry={4} fill="none" {...stroke} /> : null}
    </Svg>
  );
}
