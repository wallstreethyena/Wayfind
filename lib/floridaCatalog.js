// Menu labels and pin families use Wayfind's shared pin design.
export const FLORIDA_CATALOG_CATEGORIES = [
  {key:'all',label:'All activities',pin:'other'},
  {key:'water',label:'Cruises & water',pin:'water'},
  {key:'kayaking',label:'Kayaking',pin:'water'},
  {key:'nature',label:'Nature & wildlife',pin:'outdoors'},
  {key:'adventure',label:'Adventure',pin:'outdoors'},
  {key:'theme',label:'Theme parks',pin:'culture'},
  {key:'historical',label:'History & culture',pin:'culture'},
  {key:'museums',label:'Museums & tickets',pin:'culture'},
  {key:'airboat',label:'Airboat tours',pin:'water'},
  {key:'parasailing',label:'Parasailing',pin:'water'},
  {key:'private',label:'Private tours',pin:'event'},
  {key:'walking',label:'Walking tours',pin:'outdoors'},
];
export const FLORIDA_CATALOG_CITIES = ['Orlando','Tampa','St. Petersburg','Clearwater','Sarasota'];
export function catalogQuery(params) {
  const city = params.get('city') || '';
  const cat = params.get('cat') || 'all';
  const page = Number(params.get('page') || 0);
  if ((city && !FLORIDA_CATALOG_CITIES.includes(city)) || !FLORIDA_CATALOG_CATEGORIES.some(c=>c.key===cat) || !Number.isInteger(page) || page<0 || page>500) return null;
  return {city,cat,page,limit:5,completeCatalog:true};
}
