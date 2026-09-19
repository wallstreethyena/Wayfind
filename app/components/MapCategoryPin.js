import { mapPinUrl } from '../../lib/mapPinStandard.js';

export default function MapCategoryPin({ family = 'other', height = 32 }) {
  return <img src={mapPinUrl(family)} alt="" aria-hidden="true" width={height * 34 / 46} height={height} style={{ display: 'inline-block', flexShrink: 0, width: height * 34 / 46, height, verticalAlign: 'middle' }} />;
}
