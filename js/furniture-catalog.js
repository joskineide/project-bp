// Default furniture catalog. Sizes are typical values in meters.
// "personalizado" lets the user type a custom label + size.
export const FURNITURE_CATALOG = [
  { id: 'sofa-2l', label: 'Sofá 2 lugares', shape: 'rect', width: 1.60, height: 0.90, color: '#7c9885' },
  { id: 'sofa-3l', label: 'Sofá 3 lugares', shape: 'rect', width: 2.00, height: 0.90, color: '#7c9885' },
  { id: 'cama-casal', label: 'Cama casal', shape: 'rect', width: 1.58, height: 1.98, color: '#c99b6b' },
  { id: 'cama-solteiro', label: 'Cama solteiro', shape: 'rect', width: 0.88, height: 1.88, color: '#c99b6b' },
  { id: 'guarda-roupa', label: 'Guarda-roupa', shape: 'rect', width: 1.50, height: 0.60, color: '#8d6b53' },
  { id: 'mesa-4l', label: 'Mesa 4 lugares', shape: 'rect', width: 1.20, height: 0.80, color: '#b08968' },
  { id: 'mesa-centro', label: 'Mesa de centro', shape: 'rect', width: 1.00, height: 0.55, color: '#b08968' },
  { id: 'cadeira', label: 'Cadeira', shape: 'circle', radius: 0.25, color: '#5b7f8c' },
  { id: 'rack-tv', label: 'Rack / TV', shape: 'rect', width: 1.40, height: 0.40, color: '#4a4e69' },
  { id: 'estante', label: 'Estante', shape: 'rect', width: 0.90, height: 0.35, color: '#4a4e69' },
  { id: 'geladeira', label: 'Geladeira', shape: 'rect', width: 0.70, height: 0.70, color: '#9a8c98' },
  { id: 'fogao', label: 'Fogão', shape: 'rect', width: 0.55, height: 0.60, color: '#9a8c98' },
  { id: 'personalizado', label: 'Personalizado…', shape: 'rect', width: 0.60, height: 0.60, color: '#e07a5f', custom: true },
];
