/**
 * Every user-facing string on the customer website lives here (English). The Arabic
 * translation is strings.ar.ts with exactly the same keys (checked in i18n.ts); components
 * read the current language with useStrings().
 * Functions are used where a string needs a value inserted.
 */
import { type AbayaStyle, type OrderStatus, PRODUCTION_STAGE_LABELS, type ProductionStage, type TryOnBackground } from '@abaya/contracts';

export type SortId = 'newest' | 'price_asc' | 'price_desc';
export type PriceRangeId = 'under-3000' | '3000-5000' | 'over-5000';
export interface PriceRange {
  id: PriceRangeId;
  label: string;
  min: number | undefined;
  max: number | undefined;
}

export const brand = {
  name: 'Abaya Atelier',
  tagline: 'Abayas made to your measure',
  description:
    'Choose an abaya, redesign it your way — fabric, colour, sleeves, details — and have it stitched to your own measurements by skilled tailors in India.',
};

export const nav = {
  skipToContent: 'Skip to content',
  shop: 'Shop abayas',
  collections: 'Collections',
  help: 'Help',
  account: 'Account',
  login: 'Log in',
  bag: 'Bag',
  bagWithCount: (n: number) => `Bag, ${n} ${n === 1 ? 'item' : 'items'}`,
  breadcrumb: 'Breadcrumb',
  mainLabel: 'Main',
  mobileLabel: 'Menu links',
  notifications: 'Notifications',
  closeNotification: 'Close',
  wishlist: 'Wishlist',
  wishlistWithCount: (n: number) => `Wishlist, ${n} saved ${n === 1 ? 'design' : 'designs'}`,
  orders: 'My orders',
  downloads: 'My downloads',
  menu: 'Menu',
  /** A newer version of the website is live (components/pwa/pwa.tsx). */
  updateAvailable: 'A new version of Abaya Atelier is ready',
  updateRefresh: 'Refresh',
  /** The try-on banner under the navbar. */
  tryOnBanner: 'Virtual Try On',
  tryOnBannerBody: 'See yourself in our new abayas',
  tryOnBannerShort: 'See it on you',
  tryOnBannerClose: 'Hide this banner',
  closeMenu: 'Close menu',
  home: 'Home',
  cta: 'Design yours',
  tagline: 'Made to measure',
  menuFooter: 'Stitched to your measurements',
  /** The language switch shows the other language, in that language. */
  switchLanguage: 'العربية',
  switchLanguageLabel: 'اقرأ الموقع بالعربية (Arabic)',
  currencyLabel: 'Display currency',
  switchLanguageShort: 'ع',
};

export const footer = {
  /** Shown when prices are displayed in AED. */
  currencyNote: (code: 'AED' | 'SAR') =>
    `Prices in ${code} are for reference, converted at today's rate. You are charged in Indian rupees (INR); your bank's rate may differ slightly.`,
  about:
    'Made-to-order modest wear. Every abaya is cut and stitched for one person, and you can follow it stage by stage.',
  shopHeading: 'Shop',
  helpHeading: 'Help',
  policiesHeading: 'Policies',
  allAbayas: 'All abayas',
  faqs: 'FAQs',
  sizing: 'Sizing & measurements',
  contact: 'Contact support',
  returns: 'Returns & alterations',
  shipping: 'Shipping',
  privacy: 'Privacy notice',
  terms: 'Terms of use',
  grievance: 'Grievance officer',
  copyright: (year: number) => `© ${year} ${brand.name}. All rights reserved.`,
  imageNotice: 'Our designs and photographs are protected. Every image carries an invisible mark that identifies it.',
  prices: 'All prices in INR and inclusive of GST.',
};

export const styles: Record<AbayaStyle, string> = {
  CLOSED: 'Closed',
  OPEN_FRONT: 'Open front',
  BUTTERFLY: 'Butterfly',
  KIMONO: 'Kimono',
  BISHT: 'Bisht',
  KAFTAN: 'Kaftan',
  OTHER: 'Other',
};

export const common = {
  from: 'From',
  loading: 'Loading…',
  retry: 'Try again',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  add: 'Add',
  close: 'Close',
  back: 'Back',
  continue: 'Continue',
  optional: 'optional',
  required: 'required',
  genericError: 'Something went wrong. Please try again.',
  networkError: 'We could not reach our servers. Check your connection and try again.',
  apiDown: 'Our catalogue is taking a moment to load. Please refresh in a little while.',
  daysLeadTime: (days: number) => `Made for you in about ${days} days`,
  quantity: 'Quantity',
  increase: 'Increase quantity',
  decrease: 'Decrease quantity',
  default: 'Default',
  loginRequired: 'Please log in to continue.',
};

export const home = {
  metaTitle: `${brand.name} — made-to-measure abayas`,
  eyebrow: 'Made to measure',
  heroTitle: 'An abaya made for you, not a size chart',
  /** The hero heading, split so "you" can be set in italic. */
  heroTitleParts: { before: 'An abaya made for ', emphasis: 'you', after: ', not a size chart' },
  heroBody:
    'Pick a design you love, make it yours — fabric, colour, sleeves and details — and our tailors stitch it to your measurements.',
  heroCta: 'Explore abayas',
  // Virtual try-on, highlighted on the home page and on every card
  heroTryOn: 'Try it on virtually',
  newTag: 'New',
  heroTryOnChip: 'See this abaya on you',
  cardTryOn: 'Try on',
  cardTryOnNamed: (name: string) => `Try ${name} on with AI`,
  tryOnFeature: {
    eyebrow: 'Virtual try-on',
    title: 'See it on you before it is stitched',
    body: 'Upload a full-length photo, or let our AI create a model with your height and build, and see any abaya on you in under a minute. Free, and only for you.',
    steps: [
      { title: 'Pick an abaya', body: 'Any design in the shop, as photographed or customised your way.' },
      { title: 'Add your photo', body: 'Or choose “A model like me” with your height and build.' },
      { title: 'See it on you', body: 'Ready in about a minute. Try another style any time.' },
    ],
    cta: 'Try it on now',
    browse: 'Choose an abaya',
    privacy: 'Your photo is private and deleted automatically within an hour.',
    before: 'Before',
    after: 'After · AI try-on',
    sliderLabel: 'Compare the photo before and after the virtual try-on',
    demoNote: 'Example made with our own model photo.',
  },
  heroSecondary: 'How it works',
  heroShowcaseLabel: 'Featured designs',
  heroShowcaseLink: (name: string) => `View ${name}`,
  collectionsTitle: 'Collections',
  collectionsBody: 'Start with a mood. Every piece can be redesigned.',
  designsCount: (n: number) => `${n} ${n === 1 ? 'design' : 'designs'}`,
  newTitle: 'New designs',
  newBody: 'Fresh from our designers, reviewed and priced by our atelier.',
  viewAll: 'View all',
  // The atelier edit: the new-designs spread on the home page
  editEyebrow: 'The atelier edit',
  editTitle: 'New season, timeless modesty',
  editBody: 'Exquisite abayas, crafted with purpose. Modern silhouettes. Timeless elegance.',
  exploreAll: 'Explore all',
  newArrival: 'New arrival',
  collectionTag: (name: string) => `${name} collection`,
  madeToOrder: (days: number) => `Made to order · ${days} days`,
  quickView: 'Quick view',
  quickViewError: 'This design could not be loaded. Please try again.',
  quickColour: 'Colour',
  customise: 'Customize this abaya',
  // Explore silhouettes: three tiles under the new designs, one per style
  silhouettesEyebrow: 'Discover your style',
  silhouettesTitle: 'Explore silhouettes',
  silhouettesBody: 'From everyday elegance to statement pieces, find the silhouette that speaks to you.',
  silhouettesExplore: 'Explore',
  silhouettes: [
    { style: 'OPEN_FRONT', title: 'Open abayas', body: 'Grace in every layer' },
    { style: 'BUTTERFLY', title: 'Butterfly abayas', body: 'Drama in every drape' },
    { style: 'CLOSED', title: 'Everyday essentials', body: 'Effortless. Refined. You.' },
  ] as { style: AbayaStyle; title: string; body: string }[],
  howTitle: 'How it works',
  howSteps: [
    { title: 'Choose', body: 'Browse original designs from our designers.' },
    { title: 'Redesign', body: 'Change the fabric, colour, sleeves, closure and embellishments.' },
    { title: 'Measure', body: 'Pick a standard size or save your own measurements in minutes.' },
    { title: 'Made for you', body: 'A partner tailor cuts and stitches it. Follow every stage with photos.' },
  ],
  trustTitle: 'Why women trust us',
  trust: [
    { title: 'Made to measure', body: 'Cut for your height, bust and sleeves — not a generic size.' },
    { title: 'Stage photos', body: 'See your abaya at cutting, stitching and quality check.' },
    { title: 'One free alteration', body: 'If the fit is not right, we alter it once for free.' },
  ],
  emptyDesigns: 'New designs are on their way. Please check back soon.',
  collectionsEyebrow: 'Curated edits',
  newEyebrow: 'Just in',
  howEyebrow: 'The atelier process',
  howBody: 'From your first choice to your doorstep, every abaya is made for one person.',
  cardCta: 'Redesign & order',
  closingEyebrow: 'Made for one',
  closingTitle: 'Your measurements. Your details. Your abaya.',
  closingBody: 'Choose a design, make it yours and our tailors will stitch it for you.',
  closingCta: 'Start designing',
  closingPoints: ['Cut to your measurements', 'Photos at every stage', 'One free alteration'],
  // The atelier in numbers (counts up when scrolled into view)
  numbersEyebrow: 'The atelier in numbers',
  numbers: [
    { value: 12, suffix: '', unit: 'days', label: 'from confirmed order to delivery' },
    { value: 7, suffix: '', unit: 'steps', label: 'through the atelier, each one photographed' },
    { value: 1, suffix: '', unit: 'free alteration', label: 'if the fit is not right' },
    { value: 100, suffix: '%', unit: 'made to measure', label: 'cut to your own measurements' },
  ],
  // Cinematic hero card
  heroPrev: 'Previous look',
  heroNext: 'Next look',
  heroDetail: 'See the fabric up close',
  heroDrag: 'Drag',
  // Three simple steps under the hero
  stepsEyebrow: 'How it works',
  steps3: [
    { title: 'Choose', body: 'Pick a design you love and make it yours: fabric, colour, sleeves and details.' },
    { title: 'Measure', body: 'Choose a standard size or type your own measurements in a minute.' },
    { title: 'Receive', body: 'Our atelier stitches it for you, with photos at every stage and one free alteration.' },
  ],
  // Craftsmanship
  craftEyebrow: 'Craftsmanship',
  craftTitle: 'Every detail, by hand',
  craftBody: 'Close-ups from our own photoshoots. What you choose on the design page is what the atelier makes.',
  craft: [
    { title: 'Fabric', body: 'Chosen for the way it falls.', options: 'Nida · Crepe · Chiffon · Linen · Jersey · Satin' },
    { title: 'Embroidery', body: 'Placed exactly where the design calls for it.', options: 'Thread · Zari · Beadwork · Lace' },
    { title: 'Sleeves', body: 'Cut to your own sleeve length.', options: 'Straight · Bell · Wide · Cuffed' },
    { title: 'Closure', body: 'The way it opens and fastens.', options: 'Open front · Zip · Buttons · Belt' },
    { title: 'Finishing', body: 'Seams checked one by one before anything leaves the atelier.', options: 'Hems · Edges · Linings' },
    { title: 'Fit', body: 'Stitched to the measurements you save, not a size chart.', options: 'Your height · Bust · Sleeve · Hem' },
  ],
  craftCta: 'Make it yours',
  // Fixed fourth collection tile
  designYourOwn: 'Design your own',
  designYourOwnDetailsLabel: 'What you can change',
  designYourOwnDetails: ['Fabric', 'Colour', 'Sleeves', 'Embroidery', 'Closure', 'Add-ons'],
  reelSkip: 'Skip the collections',
  reelView: 'View collection',
  reelCounter: (i: number, n: number) => `${String(i).padStart(2, '0')} / ${String(n).padStart(2, '0')}`,
  designYourOwnBody: 'Start from any design and change every detail.',
  // Editorial hero
  heroScroll: 'Scroll',
  heroViewDesign: 'View design',
  heroLookbook: 'Latest looks',
  heroSlide: (i: number, n: number) => `Look ${i} of ${n}`,
  heroBadge: 'Stitched to your measurements',
  // Living cards
  madeIn: (days: number) => `Made in ${days} days`,
  colours: (n: number) => `${n} ${n === 1 ? 'colour' : 'colours'}`,
  moreColours: (n: number) => `+${n}`,
  // From sketch to you
  journeyEyebrow: 'From sketch to you',
  journeyTitle: 'Every abaya travels through our atelier',
  journeyBody: 'One garment, one woman, seven careful steps — and you can follow each one with photos.',
  journey: [
    { title: 'Sketch', body: 'Our designers draw an original design; the atelier reviews it.' },
    { title: 'Fabric', body: 'You choose the fabric, colour, sleeves and details.' },
    { title: 'Pattern', body: 'A pattern is drafted to your own measurements.' },
    { title: 'Cutting', body: 'The fabric is cut by hand, piece by piece.' },
    { title: 'Stitching', body: 'A partner tailor stitches it with care.' },
    { title: 'Quality check', body: 'Every seam and every measurement is checked.' },
    { title: 'Delivered', body: 'Finished, packed and on its way to you.' },
  ],
  journeyHint: 'Drag to see every step',
  /** When each step happens, in order of `journey`. */
  journeyWhen: ['Before you order', 'When you order', 'Day 1', 'Days 2–3', 'Days 4–8', 'Day 9', 'Days 10–12'],
  journeyStepOf: (i: number, n: number) => `Step ${i} of ${n}`,
  journeyPrev: 'Previous step',
  journeyNext: 'Next step',
  journeyTrust: ['Photos at every stage', 'One free alteration', 'Stitched to measure'],
};

export const catalog = {
  metaTitle: 'Shop abayas',
  metaDescription:
    'Browse made-to-order abayas: closed, open-front, butterfly, kimono and more. Redesign every detail and order to your measurements.',
  title: 'All abayas',
  subtitle: 'Every design is made to order. Choose one and make it yours.',
  filters: 'Filters',
  style: 'Style',
  collection: 'Collection',
  price: 'Price',
  sort: 'Sort',
  anyStyle: 'All styles',
  anyCollection: 'All collections',
  anyPrice: 'Any price',
  priceRanges: [
    { id: 'under-3000', label: 'Under ₹3,000', min: undefined, max: 300000 },
    { id: '3000-5000', label: '₹3,000 – ₹5,000', min: 300000, max: 500000 },
    { id: 'over-5000', label: 'Above ₹5,000', min: 500000, max: undefined },
  ] as PriceRange[],
  sortOptions: [
    { id: 'newest', label: 'Newest' },
    { id: 'price_asc', label: 'Price: low to high' },
    { id: 'price_desc', label: 'Price: high to low' },
  ] as { id: SortId; label: string }[],
  clearFilters: 'Clear filters',
  empty: 'No abayas match these filters.',
  loadMore: 'Load more',
  loadingMore: 'Loading more…',
  end: 'You have seen every design.',
  results: (n: number) => `${n}+ designs`,
  collectionMetaDescription: (name: string) =>
    `${name}: made-to-order abayas you can redesign and have stitched to your measurements.`,
  collectionNotFound: 'This collection is not available.',
  // Shop page sections
  eyebrow: 'The atelier',
  statDesigns: 'Designs',
  statStyles: 'Styles',
  shopByStyle: 'Shop by style',
  shopByStyleBody: 'Every silhouette, made to your measurements.',
  allDesigns: 'All designs',
  designsCount: (n: number) => (n === 1 ? '1 design' : `${n} designs`),
  seeAll: 'See all',
  seeAllCount: (n: number) => `See all ${n}`,
  browseGrid: (n: number) => `Browse all ${n} designs`,
  shelfPrev: 'Previous designs',
  shelfNext: 'More designs',
  styleNotes: {
    CLOSED: 'Fully closed, classic and modest',
    OPEN_FRONT: 'Worn open over your outfit',
    BUTTERFLY: 'Wide, flowing wing sleeves',
    KIMONO: 'Straight lines, dropped sleeves',
    BISHT: 'A cloak with trimmed edges',
    KAFTAN: 'Loose, easy and elegant',
    OTHER: 'One-of-a-kind silhouettes',
  } as Record<AbayaStyle, string>,
  collectionsTitle: 'Collections',
  collectionsBody: 'Edits curated by our atelier.',
  // Filter bar
  search: 'Search',
  searchPlaceholder: 'Search abayas',
  clearSearch: 'Clear search',
  colour: 'Colour',
  anyColour: 'Any colour',
  colourCount: (name: string, n: number) => `${name}, ${n} ${n === 1 ? 'design' : 'designs'}`,
  priceUnder: (max: string) => `Under ${max}`,
  priceBetween: (min: string, max: string) => `${min} – ${max}`,
  priceAbove: (min: string) => `Above ${min}`,
  searchChip: (q: string) => `“${q}”`,
  removeFilter: (label: string) => `Remove filter: ${label}`,
  clearAll: 'Clear all',
  showing: (shown: number, total: number) => `Showing ${shown} of ${total}`,
  showResults: (n: number) => (n === 1 ? 'Show 1 design' : `Show ${n} designs`),
  done: 'Done',
  // Editorial breaks between rows
  breaks: [
    {
      eyebrow: 'Made to measure',
      title: 'Cut and stitched for you alone',
      body: 'Share your measurements once. Our tailors make every abaya to them, in about 12 days.',
      cta: 'How it works',
      href: '/help',
    },
    {
      eyebrow: 'See it first',
      title: 'Try any design on with AI',
      body: 'Open a design, choose your fabric, colour and sleeves, and see a preview before you decide.',
      cta: 'See every design',
      href: '/abayas?view=grid',
    },
  ],
};

export const design = {
  gallery: 'Design images',
  imageOf: (i: number, n: number) => `Image ${i} of ${n}`,
  showImage: (i: number) => `Show image ${i}`,
  from: 'From',
  leadTime: (days: number) => `Made for you in about ${days} days after you confirm your order.`,
  redesignTitle: 'Make it yours',
  redesignBody: 'Every choice updates the price instantly.',
  // The two ways to order
  orderModeLabel: 'How would you like it?',
  orderAsShown: 'Order as shown',
  orderAsShownBody: 'Exactly as in the photos. Just choose your size.',
  customiseIt: 'Customise it',
  customiseItBody: 'Fabric, colour, sleeves and details, your way.',
  customiseItMeta: 'Price updates as you choose',
  includedTitle: 'As shown',
  includedBody: 'What this abaya comes with, exactly as photographed.',
  wantChanges: 'Want something different? Customise it',
  selected: 'Selected',
  noSurcharge: 'Included',
  surcharge: (formatted: string) => `+${formatted}`,
  chooseOneOrMore: 'Choose any',
  chooseOne: 'Choose one',
  sizeTitle: 'Size',
  standardSize: 'Standard size',
  myMeasurements: 'My measurements',
  sizeGuide: 'How to choose',
  sizeHint: 'Standard sizes are by bust. Between two sizes? Choose the larger or use your measurements.',
  measurementsHint: 'Your abaya is cut to your own measurements. Enter them below.',
  loginForMeasurements: 'Log in to use your saved measurements.',
  noProfiles: 'You have not saved any measurements yet.',
  addProfile: 'Add measurements',
  chooseProfile: 'Choose a measurement profile',
  profileSummary: (height: number, bust: number) => `Height ${height} cm · Bust ${bust} cm`,
  newMeasurements: 'New measurements',
  measuringTips: 'How to measure',
  usingProfile: (name: string) => `Using “${name}”. Change any value and we save it to this profile.`,
  editingProfile: (name: string) => `Your changes will be saved to “${name}”.`,
  savedToAccount: (name: string) => `We save these to your account as “${name}” so you never type them again.`,
  loginToSaveMeasurements: 'You will log in when you add to bag. Your measurements stay filled in.',
  measurementsIncomplete: 'Please fill in every measurement.',
  total: 'Total',
  estimate: 'Estimated',
  confirmedPrice: 'Price confirmed',
  priceChanged: 'Price updated by our system.',
  breakdown: 'Price breakdown',
  addToBag: 'Add to bag',
  adding: 'Adding…',
  added: 'Added to your bag',
  viewBag: 'View bag',
  selectSize: 'Choose a size first',
  selectProfile: 'Choose your measurements first',
  wishlistAdd: 'Save to wishlist',
  wishlistRemove: 'Remove from wishlist',
  wishlistAdded: 'Saved to your wishlist',
  wishlistRemoved: 'Removed from your wishlist',
  details: 'Details',
  notFoundTitle: 'Design not found',
  notFoundBody: 'This design is no longer available. Explore our other abayas.',
  selectionIncomplete: 'Please choose an option in every required section.',
  aboutMadeToOrder:
    'Made to order: once you place your order, our atelier confirms the specification and a partner tailor starts cutting.',
  freeAlteration: 'One free alteration included',
  stagePhotos: 'Photos at each stage',
  zoom: 'Zoom in',
  zoomHint: 'Click to zoom',
  closeZoom: 'Close',
  prevImage: 'Previous image',
  nextImage: 'Next image',
  availableIn: 'Available in',
  shownIn: (colour: string) => `Photos shown in ${colour}`,
  noPhotosIn: (colour: string) => `No photos in ${colour} yet`,
  // Product page (premium layout)
  madeToMeasure: 'Stitched to your measurements',
  tryOnButton: 'Try it on you',
  tryOnHint: 'See this abaya on you with AI, ready in about a minute',
  colourCount: (n: number) => `${n} ${n === 1 ? 'colour' : 'colours'}`,
  promisesLabel: 'Our promise',
  promiseLeadTitle: (days: number) => `${days} days`,
  promiseLeadBody: 'Cut and stitched for you once you confirm',
  promisePhotosTitle: 'Every stage',
  promisePhotosBody: 'Photos as it is cut, stitched and finished',
  promiseAlterTitle: 'Free alteration',
  promiseAlterBody: 'One adjustment after it arrives',
  detailsTitle: 'The details',
  totalReassurance: 'Made to order · Secure payment · One free alteration',
  stepLabel: (n: number) => `Step ${n}`,
  bustWord: 'bust',
  basePrice: 'Base price',
  cmUnit: 'cm',
  imageRights: 'Design and photographs © Abaya Atelier. For personal viewing only; every image carries an invisible mark.',
};

export const tryOn = {
  eyebrow: 'AI studio',
  title: 'See it before it’s made',
  body: 'Preview your choices on our model, or try the abaya on a photo of yourself.',
  preview: 'Preview my design',
  previewAgain: 'Preview my new choices',
  requestLabel: 'In your words (optional)',
  requestPlaceholder: 'e.g. in dusty rose satin, on a terrace at sunset',
  requestExamples: ['In soft rose satin', 'On a Dubai beach at sunset', 'Softer evening light'],
  requestHint: 'When you write here, the preview follows your words alone: fabric, colours, background and light. The design, embroidery and cut stay as our designer made them, and your order is still made from the options you choose.',
  fromWordsNote: 'Preview made from your words, not from your selected options.',
  leftOut: (parts: string[]) => `We left out: ${parts.join('; ')} (that would change the design).`,
  tryOn: 'Try it on',
  left: (previews: number, tryOns: number) => `${previews} preview${previews === 1 ? '' : 's'} and ${tryOns} try-on${tryOns === 1 ? '' : 's'} left today`,
  loginHint: 'Log in to preview your design or try it on.',
  asShownNote: 'The photos already show this abaya as it is. Customise it to preview your own changes.',
  unavailable: 'AI pictures are resting for today. Please come back tomorrow.',
  testMode: 'Test mode: pictures are placeholders until the AI key is added.',
  making: 'Making your preview and checking it against the original… about 40 seconds',
  makingTryOn: 'Dressing you in the abaya… about 30 seconds',
  // Which abaya to try on, when she has customised it
  choose: {
    title: 'Which abaya would you like to try on?',
    body: 'You have customised this abaya. Try on your version, or the original as photographed.',
    original: 'Original',
    originalHint: 'Exactly as in the photos',
    custom: 'My customised version',
    customHint: 'With your changes',
    customMakeFirst: 'We create your customised abaya first: about a minute more.',
    incomplete: 'Finish choosing your options to try on your customised version.',
  },
  versionOriginal: 'Original',
  versionCustom: 'Customised',
  waitStageCustomise: 'Creating your customised abaya',
  // The try-on guide (first time, before the try-on window)
  guide: {
    label: 'How the virtual try-on works',
    eyebrow: 'Virtual try-on',
    stepOf: (i: number, n: number) => `Step ${i} of ${n}`,
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    gotIt: 'Got it, let’s try',
    howItWorks: 'How it works',
    steps: [
      {
        title: 'Choose how to try it on',
        body: 'Use your own photo, or let our AI create a model with your height and build. No photo needed for that.',
        points: ['My photo', 'A model like me'],
      },
      {
        title: 'Take a good photo',
        body: 'The better the photo, the truer the picture.',
        points: ['Stand straight, facing the camera, whole body in the photo', 'Take off shawls, dupattas and jackets', 'Fitted, plain clothes and good light'],
      },
      {
        title: 'Made to your measurements',
        body: 'Optional: tick it to see the length and sleeves as our tailor would cut them for you.',
        points: ['Your height', 'Sleeve and full length'],
      },
      {
        title: 'See it on you',
        body: 'It is ready in about a minute. Keep browsing if you like: we will let you know.',
        points: ['Private: only you can see it', 'Deleted automatically after one hour'],
      },
    ],
  },
  // Waiting screen (try-on) and the notice when it is ready
  waitUsually: (long: boolean): string => (long ? 'Usually ready in 1–2 minutes' : 'Usually ready in about a minute'),
  waitStageUpload: 'Uploading and checking your photo',
  waitStageQueue: 'Sending it to our AI studio',
  waitStageModel: 'Creating a model with your height and build',
  waitStageDress: 'Dressing you in the abaya',
  waitStageDressModel: 'Dressing her in the abaya',
  waitStageFit: 'Tailoring the length and sleeves to your measurements',
  waitStageAlmost: 'Almost ready, adding the finishing touches',
  waitStageSlow: 'Our AI studio is busier than usual. It is still working on your picture.',
  waitElapsed: (time: string) => `Elapsed ${time}`,
  waitProgress: 'Progress of your try-on',
  keepBrowsing: 'Keep browsing',
  keepBrowsingHint: 'You can close this and look around. We will show a notice here as soon as your picture is ready.',
  readyTitle: 'Your try-on is ready',
  readyBody: (name: string) => `${name} on you. It stays here for an hour.`,
  readyView: 'View',
  readyFailedTitle: 'We could not make your try-on',
  readyFailedBody: (name: string) => `${name}: please try again with another photo.`,
  badge: 'AI preview · approximate',
  imageRights: 'For your personal use. This picture carries an invisible mark that identifies it.',
  keepNote: (minutes: number) =>
    `Each AI picture stays in your recent pictures for ${minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`}, then it is deleted.`,
  recentTitle: 'Your recent pictures',
  recentPreview: 'AI preview',
  recentTryOn: 'Try-on',
  recentMaking: 'Making…',
  recentFailed: 'Not made',
  minutesLeft: (minutes: number) => (minutes <= 1 ? 'Deleting now' : `${minutes} min left`),
  showRecent: (kind: string, minutes: number) => `Show this ${kind} (${minutes <= 1 ? 'deleting now' : `${minutes} minutes left`})`,
  fromRecent: 'From your recent pictures.',
  tryOnBadge: 'AI try-on · approximate',
  previewAlt: (name: string) => `AI preview of ${name} with your choices`,
  stale: 'Your choices have changed since this preview.',
  disclaimer:
    'An AI picture to help you imagine it. Small details like embroidery placement may differ: your abaya is stitched exactly to the options you choose.',
  retry: 'Try again',
  // Try-on dialog
  dialogTitle: 'Try it on',
  dialogBody: 'Upload a full-length photo of yourself and see this abaya on you.',
  tips: ['Stand straight, facing the camera, whole body in the photo', 'Take off shawls, dupattas, scarves over your shoulders and jackets', 'Fitted, plain clothes work best; good light, plain background if you can'],
  choosePhoto: 'Choose a photo',
  changePhoto: 'Change photo',
  takePhoto: 'Take a photo',
  camera: {
    title: 'Take your photo',
    hint: 'Step back until your whole body fits inside the outline, from head to feet.',
    starting: 'Starting the camera…',
    denied: 'We could not open your camera. Allow camera access in your browser, or choose a photo instead.',
    chooseInstead: 'Choose a photo instead',
    switchCamera: 'Switch camera',
    timer: 'Self-timer',
    timerOff: 'Off',
    capture: 'Take photo',
    retake: 'Retake',
    use: 'Use this photo',
    close: 'Close camera',
  },
  photoFormats: 'JPEG, PNG, WebP or iPhone HEIC, up to 10 MB',
  preparingPhoto: 'Preparing your photo…',
  photoConvertFailed: 'We could not open this photo. Please try another one, or a JPEG.',
  yourPhoto: 'Your photo',
  wearPreview: 'Wear my customised version',
  wearPreviewHint: 'Uses your AI preview above. Otherwise the abaya from our photos.',
  consent:
    'I agree my photo is sent to our AI provider to make this picture. Only I can see it, and it is deleted automatically an hour after it is made.',
  consentRequired: 'Please agree to the photo terms first.',
  photoRequired: 'Please choose a photo first.',
  // Ways to try it on, and her measurements
  modeLabel: 'How would you like to try it on?',
  modePhoto: 'My photo',
  modePhotoHint: 'Upload a full-length photo of yourself.',
  modeModel: 'A model like me',
  modeModelHint: 'No photo: a model with your height and build.',
  measurementsTitle: 'Your measurements',
  useSaved: (name: string) => `Use “${name}”`,
  heightLabel: 'Height',
  weightLabel: 'Weight',
  bustLabel: 'Bust',
  waistLabel: 'Waist',
  hipLabel: 'Hips',
  sleeveLabel: 'Sleeve length',
  fullLengthLabel: 'Full length (shoulder to floor)',
  optional: 'optional',
  cm: 'cm',
  kg: 'kg',
  moreMeasurements: 'Add bust, waist and hips (better build)',
  fitToggle: 'Show it made to my measurements',
  fitToggleHint: 'The length and sleeves as our tailor will cut them for you. Takes one more AI step.',
  // The background behind her in the try-on
  background: {
    title: 'Background',
    hint: 'Keep your own, or choose where you would like to be.',
    keepPhoto: 'My background',
    keepModel: 'Plain studio',
    custom: 'Describe your own',
    customLabel: 'Describe your background',
    customPlaceholder: 'e.g. a beach at sunset, a Dubai rooftop at night',
    customHint: 'Only the place, light or mood. The abaya and you stay exactly as you are.',
    extra: 'A new background takes about 30 seconds more.',
    presets: {
      studio: 'Luxury studio',
      courtyard: 'Arabian courtyard',
      desert: 'Desert dunes',
      marble: 'Marble hall',
      garden: 'Rose garden',
      skyline: 'City skyline',
    } as Record<TryOnBackground, string>,
  },
  waitStageBackground: 'Setting your new background',
  bodyPrivacy: 'Used only to make this picture. Never saved to your profile, and deleted with the picture after an hour.',
  heightRequired: 'Please enter your height in cm (120 to 210).',
  rangeHint: (min: number, max: number, unit: string) => `${min}–${max} ${unit}`,
  sleeveHint: 'shoulder to wrist',
  outOfRange: (label: string, min: number, max: number, unit: string) => `${label} must be between ${min} and ${max} ${unit}.`,
  checkFields: 'Please check the measurements marked in red.',
  consentModel: 'I agree my measurements are sent to our AI provider to make this picture.',
  makingModel: 'Creating a model with your build, then dressing her in the abaya… about a minute',
  makingFit: 'Dressing you in the abaya, then tailoring the length and sleeves… about a minute',
  start: 'Try it on',
  result: 'You in this abaya',
  resultAlt: (name: string) => `You wearing ${name} (AI try-on)`,
  privacy: 'Only you can see this. Deleted automatically an hour after it is made.',
  deleteNow: 'Delete my photo and result',
  deleted: 'Your photo and result are deleted.',
  another: 'Try another photo',
  close: 'Close',
};

export const auth = {
  metaTitle: 'Log in',
  eyebrow: 'Welcome',
  title: 'Welcome back',
  subtitle: 'Use your email (we send you a one-time code) or continue with Google.',
  benefits: 'Save your measurements, keep a wishlist and follow every abaya as it is made. New here? The same form creates your account.',
  /** When login was asked for from a design page (Add to bag, preview, try-on). */
  keepTitle: 'Sign in to keep your design',
  keepBody: 'Your choices are saved. Sign in and we bring you straight back.',
  /** The photo window beside the form. */
  caption: 'Stitched to measure',
  view: 'View this abaya',
  trust: [
    { title: 'Measurements saved', body: 'Add them once, reuse them on every order.' },
    { title: 'Photos at every stage', body: 'Watch your abaya being cut, stitched and finished.' },
    { title: 'Secure payment', body: 'UPI and cards through Razorpay.' },
  ],
  notConfigured:
    'Login is not configured in this environment (Clerk keys are missing). Browsing the catalogue still works.',
  legal: 'By continuing you agree to our Terms of use and Privacy notice.',
  signedOut: 'You have been signed out.',
};

export const consent = {
  title: 'Before you continue',
  body:
    'We collect your contact details, addresses and body measurements only to make and deliver your abaya. Please review and accept our policies.',
  terms: 'I agree to the Terms of use',
  privacy: 'I have read the Privacy notice and agree to my data being used as described',
  marketing: 'Send me occasional news about new designs and offers (optional)',
  whatsapp: 'Send my order updates on WhatsApp (optional)',
  whatsappPhone: 'WhatsApp mobile number',
  whatsappPhoneHint: '10-digit Indian mobile number. We save it to your profile.',
  submit: 'Agree and continue',
  submitting: 'Saving…',
  required: 'Please accept the Terms of use and the Privacy notice to continue.',
  readTerms: 'Read terms',
  readPrivacy: 'Read privacy notice',
  signOutInstead: 'Sign out instead',
};

export const account = {
  metaTitle: 'My account',
  title: 'My account',
  greeting: (name: string | null) => (name ? `Salaam, ${name}` : 'Your account'),
  sections: {
    profile: 'Profile',
    orders: 'Orders',
    addresses: 'Addresses',
    measurements: 'Measurements',
    wishlist: 'Wishlist',
    aiPictures: 'My AI pictures',
    notifications: 'Order updates',
    privacy: 'Privacy & data',
  },
  whatsapp: {
    title: 'Order updates on WhatsApp',
    body: 'Get a WhatsApp message when your order is confirmed, shipped and delivered. You can turn this off at any time.',
    on: (phone: string) => `On. Messages go to ${phone}.`,
    off: 'Off',
    phoneLabel: 'WhatsApp mobile number',
    phoneHint: '10-digit Indian mobile number. We save it to your profile.',
    phoneInvalid: 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.',
    confirm: 'Turn on WhatsApp updates',
    changeNumber: 'Change number',
    turnedOn: 'WhatsApp updates are on',
    turnedOff: 'WhatsApp updates are off',
  },
  viewOrders: 'View my orders',
  memberSince: (date: string) => `Member since ${date}`,
  stats: { orders: 'Orders', measurements: 'Measurements', wishlist: 'Saved designs', aiPictures: 'AI pictures', addresses: 'Addresses' },
  sectionsBody: {
    profile: 'Your name and mobile number, for your orders and delivery.',
    addresses: 'Where we deliver your abayas.',
    measurements: 'Saved once, used for every abaya you order.',
    wishlist: 'Designs you saved with the heart.',
    aiPictures: 'Your previews and try-ons from every abaya. Each one is deleted an hour after you got it.',
    notifications: 'How we keep you posted while your abaya is made.',
    privacy: 'Download a copy of your data, or delete your account.',
  },
  name: 'Full name',
  phone: 'Mobile number',
  phoneHint: '10-digit Indian mobile number',
  email: 'Email',
  profileSaved: 'Profile saved',
  addresses: {
    empty: 'No saved addresses yet.',
    add: 'Add address',
    edit: 'Edit address',
    formTitleNew: 'New address',
    formTitleEdit: 'Edit address',
    fullName: 'Full name',
    phone: 'Mobile number',
    line1: 'House / flat, street',
    line2: 'Area, locality',
    landmark: 'Landmark',
    city: 'City',
    state: 'State',
    pincode: 'Pincode',
    isDefault: 'Make this my default address',
    default: 'Default',
    saved: 'Address saved',
    deleted: 'Address deleted',
    confirmDelete: 'Delete this address?',
  },
  measurements: {
    empty: 'Save your measurements once and use them for every abaya.',
    add: 'Add measurements',
    edit: 'Edit',
    deleted: 'Measurement profile deleted',
    confirmDelete: 'Delete this measurement profile?',
    updated: (date: string) => `Updated ${date}`,
  },
  aiPictures: {
    empty: 'No AI pictures right now. Open any abaya to preview your changes or try it on.',
    browse: 'Browse abayas',
    preview: 'Preview',
    tryOn: 'Try-on',
    madeAgo: (minutes: number) => (minutes < 1 ? 'Made just now' : `Made ${minutes} min ago`),
    deletedIn: (minutes: number) => (minutes <= 1 ? 'Deleted in less than a minute' : `Deleted in ${minutes} min`),
    timeLeft: 'Time left',
    beingMade: 'Being made…',
    failed: 'Could not be made',
    open: (name: string) => `Open the AI picture of ${name}`,
    viewAbaya: 'View abaya',
    unavailable: 'This abaya is no longer available',
    deleteNow: 'Delete now',
    deleted: 'Picture deleted.',
    close: 'Close',
    noSave: 'For viewing only. This picture cannot be saved and carries a watermark.',
  },
  wishlist: {
    empty: 'Tap the heart on any design to save it here.',
    unavailable: 'No longer available',
    remove: 'Remove',
    removeNamed: (name: string) => `Remove ${name} from your wishlist`,
    view: 'View design',
    browse: 'Browse abayas',
  },
  privacy: {
    body:
      'Under India’s Digital Personal Data Protection Act you can download a copy of your data or ask us to delete your account.',
    download: 'Download my data',
    downloading: 'Preparing…',
    downloaded: 'Your data has been downloaded',
    deleteTitle: 'Delete my account',
    deleteBody:
      'This permanently removes your profile, addresses, measurements, wishlist and bag. Order records are kept without your personal details, as required for accounting.',
    deleteConfirmLabel: 'Type DELETE to confirm',
    deleteButton: 'Delete my account',
    deleting: 'Deleting…',
    deleted: 'Your account has been deleted.',
    policyLink: 'Read our privacy notice',
  },
  signOut: 'Sign out',
};

export const measurementForm = {
  metaTitleNew: 'Add measurements',
  metaTitleEdit: 'Edit measurements',
  titleNew: 'Your measurements',
  titleEdit: 'Edit measurements',
  intro:
    'Use a soft measuring tape and measure over light clothing. Stand straight and relaxed. Ask someone to help for length and shoulders.',
  profileName: 'Profile name',
  profileNameHint: 'For example “Me” or “Ammi”.',
  unit: 'cm',
  range: (min: number, max: number) => `Usually between ${min} and ${max} cm`,
  notes: 'Notes for the tailor',
  notesHint: 'Anything that helps the fit, e.g. “prefer a loose fit around the hips”.',
  isDefault: 'Use this profile by default',
  save: 'Save measurements',
  saved: 'Measurements saved',
  stepOf: (i: number, n: number) => `Step ${i} of ${n}`,
  next: 'Next',
  previous: 'Previous',
  review: 'Review',
  fields: {
    heightCm: { label: 'Height', help: 'Stand against a wall without shoes. Measure from the floor to the top of your head.' },
    bustCm: { label: 'Bust', help: 'Around the fullest part of your chest, keeping the tape level.' },
    waistCm: { label: 'Waist', help: 'Around your natural waist, the narrowest part of your torso.' },
    hipCm: { label: 'Hips', help: 'Around the fullest part of your hips, feet together.' },
    shoulderCm: { label: 'Shoulder', help: 'Across your back, from one shoulder point to the other.' },
    sleeveLengthCm: { label: 'Sleeve length', help: 'From the shoulder point down to your wrist bone, arm relaxed.' },
    fullLengthCm: {
      label: 'Full length',
      help: 'From the top of your shoulder (near the neck) down to the floor, without shoes.',
    },
    wristCm: { label: 'Wrist', help: 'Around your wrist bone. Needed for cuffed or elastic sleeves.' },
  },
  loadError: 'We could not load this measurement profile.',
  enterValue: (label: string) => `Please enter your ${label.toLowerCase()} in cm.`,
  diagramLabel: (label: string) => `Diagram showing where to measure ${label.toLowerCase()}`,
  backToAccount: 'Back to account',
};

export const ordering = {
  comingSoon: 'Ordering coming soon',
  priceNote: 'Ordering opens soon',
  priceNoteBody: 'Preview it and try it on with AI today.',
  comingSoonBody: 'We are opening orders soon. For now, design yours and see it with AI: previews and try-ons are open.',
  notifyMe: 'Notify me when ordering opens',
  notified: 'We will let you know when ordering opens',
  notifiedToast: 'Done. We will tell you as soon as ordering opens.',
  pageTitle: 'Ordering is coming soon',
  pageBody: 'Our atelier opens orders very soon. Until then, explore the abayas, customise them and see them on you with AI.',
  explore: 'Explore abayas',
};

export const bag = {
  metaTitle: 'Your bag',
  title: 'Your bag',
  empty: 'Your bag is empty.',
  emptyCta: 'Explore abayas',
  loginTitle: 'Log in to see your bag',
  loginBody: 'Your bag is saved to your account so you can continue on any device.',
  loginCta: 'Log in',
  size: 'Size',
  measurements: (name: string) => `Made to measure: ${name}`,
  remove: 'Remove',
  removed: 'Removed from your bag',
  subtotal: 'Subtotal',
  shippingNote: 'Shipping is calculated at checkout. Prices include GST.',
  checkout: 'Checkout',
  cannotCheckout: 'Please fix the items marked below before checkout.',
  unavailable: 'Unavailable',
  priceBreakdown: 'Price breakdown',
  each: 'each',
};

export const checkout = {
  metaTitle: 'Checkout',
  title: 'Checkout',
  stepAddress: 'Delivery address',
  stepReview: 'Review',
  stepPay: 'Payment',
  selectAddress: 'Choose where to deliver',
  addNewAddress: 'Add a new address',
  noAddresses: 'Add an address to continue.',
  note: 'Note for our atelier',
  noteHint: 'Optional — anything we should know about your order.',
  reviewTitle: 'Your order',
  deliverTo: 'Deliver to',
  change: 'Change',
  items: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
  subtotal: 'Subtotal',
  shipping: 'Shipping',
  shippingCalculated: 'Calculated on payment',
  total: 'Total',
  pay: (amount: string) => `Pay ${amount}`,
  chargedInInr: (inr: string, code: 'AED' | 'SAR') => `You will be charged ${inr} in Indian rupees. The ${code} amount is for reference at today's rate.`,
  testModeTitle: 'Test mode — no real payment',
  testModeBody: 'Razorpay is not connected on this server, so no money is charged. Use the button below to mark this order as paid and continue.',
  simulatePay: (amount: string) => `Simulate payment of ${amount}`,
  paying: 'Opening secure payment…',
  verifying: 'Confirming your payment…',
  securedBy: 'Payments are processed securely by Razorpay (UPI, cards, net banking).',
  scriptError: 'We could not load the payment window. Check your connection and try again.',
  dismissed: 'Payment was not completed. Your order is saved — you can try again.',
  failed: (reason: string) => `Payment failed: ${reason}`,
  retry: 'Try payment again',
  verifyFailed: 'We could not confirm your payment. If money was debited, it will reflect in your order shortly.',
  bagEmpty: 'Your bag is empty.',
  bagProblems: 'Some items in your bag need attention.',
  goToBag: 'Go to bag',
  razorpayName: brand.name,
  razorpayDescription: (orderNumber: string) => `Order ${orderNumber}`,
  successMetaTitle: 'Order placed',
  successTitle: 'Thank you — your order is placed',
  successBody:
    'We have received your payment. Our atelier will confirm your specification and a tailor will begin shortly. You can follow every stage from your orders page.',
  successOrder: (orderNumber: string) => `Order number ${orderNumber}`,
  viewOrder: 'Track my order',
  continueShopping: 'Continue shopping',
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

/** Production stages as customers see them (order page and status chips). */
export const stageLabels: Record<ProductionStage, string> = { ...PRODUCTION_STAGE_LABELS };

export const orders = {
  metaTitle: 'My orders',
  title: 'My orders',
  empty: 'You have not placed any orders yet.',
  emptyCta: 'Explore abayas',
  orderNumber: (n: string) => `Order ${n}`,
  placedOn: (date: string) => `Placed on ${date}`,
  createdOn: (date: string) => `Created on ${date}`,
  items: (n: number) => `${n} ${n === 1 ? 'abaya' : 'abayas'}`,
  view: 'View order',
  detailMetaTitle: (n: string) => `Order ${n}`,
  itemTitle: (i: number, n: number) => `Abaya ${i} of ${n}`,
  progress: 'Progress',
  stagePhotos: 'Stage photos',
  stagePhotoAlt: (stage: string) => `Photo at ${stage}`,
  shipments: 'Shipments',
  tracking: 'Track shipment',
  trackingNumber: (carrier: string | null, n: string | null) => [carrier, n].filter(Boolean).join(' · '),
  priceBreakdown: 'Price breakdown',
  options: 'Your design',
  size: 'Size',
  madeToMeasure: 'Made to your measurements',
  deliveryAddress: 'Delivery address',
  payment: 'Payment',
  subtotal: 'Subtotal',
  shipping: 'Shipping',
  discount: 'Discount',
  total: 'Total',
  free: 'Free',
  help: 'Need help with this order?',
  helpBody: 'Our support team can help with sizing, delivery or alterations.',
  helpCta: 'Get help',
  notFound: 'We could not find this order.',
  cancelledItem: 'This abaya was cancelled. Any refund is sent to your original payment method.',
  remakeItem: 'We are remaking this abaya for you.',
  awaitingPayment: 'This order is waiting for payment and will not be made until payment is confirmed.',
  note: 'Your note',
};

export const downloads = {
  // Design page: the two ways to buy
  twoWaysTitle: 'Two ways to have this design',
  orderTitle: 'Order the abaya',
  orderBody: 'We stitch it for you, made to your measurements, with photos at every stage.',
  downloadTitle: 'Download the HD design',
  downloadBody: (n: number) =>
    `Get the full-quality images (${n === 1 ? '1 image' : `${n} images`}), for example to show your own tailor. No abaya is made or shipped.`,
  downloadCta: (price: string) => `Download HD · ${price}`,
  owned: 'You own this design',
  ownedCta: 'Open My downloads',
  previewNote: 'Images on our website are smaller web previews.',
  // Purchase dialog
  dialogTitle: 'Download the HD design',
  dialogBody: (n: number) => `${n === 1 ? '1 full-quality image' : `${n} full-quality images`} of this design.`,
  includes: ['Full resolution JPEG files', 'Higher quality than the website images', 'Download again any time from My downloads'],
  licenceTitle: 'Licence',
  licence:
    'Personal use only. You may keep these images and have this abaya made for yourself. You may not resell, share, publish or sell abayas made from this design. Each file carries a licence code.',
  accept: 'I agree to the personal-use licence',
  acceptRequired: 'Please agree to the licence to continue.',
  pay: (price: string) => `Pay ${price}`,
  simulatePay: (price: string) => `Simulate payment of ${price}`,
  testMode: 'Test mode: no real payment is taken.',
  paying: 'Opening payment…',
  confirming: 'Confirming your payment…',
  dismissed: 'Payment was not completed. You can try again.',
  failed: (reason: string) => `Payment failed: ${reason}`,
  scriptError: 'Could not open the payment window. Check your connection and try again.',
  slow: 'Your payment is taking longer to confirm. It will appear in My downloads shortly.',
  bought: 'Payment received. Your HD design is ready.',
  razorpayDescription: (name: string) => `HD design: ${name}`,
  // My downloads
  metaTitle: 'My downloads',
  title: 'My downloads',
  subtitle: 'HD designs you bought. Download them again whenever you need.',
  empty: 'You have not bought any HD designs yet.',
  emptyBody: 'Open any abaya and choose "Download HD" to get the full-quality design images.',
  browse: 'Browse abayas',
  boughtOn: (date: string) => `Bought ${date}`,
  image: (i: number) => `Image ${i}`,
  downloadAll: 'Download all',
  preparing: 'Preparing…',
  orderThis: 'Order this abaya',
  licenceShort: 'Personal-use licence',
  newPurchase: 'Your new download is ready below.',
};

export const help = {
  metaTitle: 'Help & FAQs',
  metaDescription: 'Answers about sizing, measurements, delivery time, alterations and payments.',
  title: 'Help & FAQs',
  intro: 'Everything you need to know about ordering a made-to-measure abaya.',
  contactTitle: 'Still need help?',
  contactBody: 'Write to us and our support team will reply within one working day.',
  contactEmail: 'support@example.com',
  contactHours: 'Monday to Saturday, 10 am – 6 pm IST',
  sections: [
    {
      id: 'sizing',
      title: 'Sizing',
      faqs: [
        {
          q: 'How do I choose a standard size?',
          a: 'Standard sizes are based on your bust measurement, shown next to each size. If you are between two sizes, choose the larger one or order with your own measurements.',
        },
        {
          q: 'Is a standard size or my own measurements better?',
          a: 'Your own measurements give the best fit, especially for length and sleeves. Made-to-measure has a small extra charge shown on the design page.',
        },
      ],
    },
    {
      id: 'measurements',
      title: 'Measurements',
      faqs: [
        {
          q: 'How do I measure myself?',
          a: 'Use a soft tape over light clothing. Our measurement form shows a diagram and a short tip for each measurement. It takes about five minutes, and a helper makes it easier.',
        },
        {
          q: 'Can I save measurements for family members?',
          a: 'Yes. You can save several profiles, for example “Me” and “Ammi”, and choose one for each abaya.',
        },
        {
          q: 'What if I change my measurements after ordering?',
          a: 'Each order keeps a copy of the measurements used, so later edits do not change an abaya already in production. Contact support quickly if something needs correcting.',
        },
      ],
    },
    {
      id: 'delivery',
      title: 'Delivery time',
      faqs: [
        {
          q: 'How long does it take?',
          a: 'Each design shows its making time, usually 10–15 days, plus 3–7 days for delivery across India. You can follow every stage — cutting, stitching, quality check — on your order page.',
        },
        {
          q: 'Do you deliver everywhere in India?',
          a: 'We deliver to most pincodes through our courier partners. You will get a tracking link as soon as your abaya ships.',
        },
      ],
    },
    {
      id: 'alterations',
      title: 'Alterations & returns',
      faqs: [
        {
          q: 'What if it does not fit?',
          a: 'Every abaya includes one free alteration. Contact support within 7 days of delivery and we will arrange it.',
        },
        {
          q: 'Can I return a made-to-order abaya?',
          a: 'Because each piece is made for you, we do not accept returns for change of mind. Damaged or wrongly made items are remade or refunded. See our returns and alterations policy.',
        },
      ],
    },
    {
      id: 'payments',
      title: 'Payments',
      faqs: [
        {
          q: 'How can I pay?',
          a: 'We accept UPI, debit and credit cards, and net banking through Razorpay. Prices include GST.',
        },
        {
          q: 'My money was debited but the order shows unpaid.',
          a: 'This usually resolves within a few minutes. If it does not, contact support with your order number; any unconfirmed payment is refunded automatically by your bank.',
        },
        {
          q: 'How do refunds work?',
          a: 'Refunds go back to your original payment method, usually within 5–7 working days.',
        },
      ],
    },
  ],
};

export const policies = {
  placeholderNotice:
    'Placeholder text: this policy must be reviewed by a lawyer before launch. Details in [brackets] need to be filled in.',
  lastUpdated: 'Last updated',
  onThisPage: 'Policies',
};

export const errors = {
  notFoundTitle: 'Page not found',
  notFoundBody: 'The page you are looking for does not exist or has moved.',
  notFoundCta: 'Go to the homepage',
  errorTitle: 'Something went wrong',
  errorBody: 'Please try again. If the problem continues, contact support.',
};

// ───────────── Policy pages (PLACEHOLDER legal text — must be reviewed by a lawyer before launch) ─────────────

export interface PolicySection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export interface PolicyPage {
  title: string;
  description: string;
  updated: string;
  intro: string;
  sections: PolicySection[];
}

export type PolicySlug = 'returns-and-alterations' | 'shipping' | 'privacy' | 'terms' | 'grievance';

export const policyPages: Record<PolicySlug, PolicyPage> = {
  'returns-and-alterations': {
    title: 'Returns & alterations',
    description: 'How alterations, remakes and refunds work for made-to-order abayas.',
    updated: '1 October 2026',
    intro:
      'Every abaya is cut and stitched for one person, so our policy focuses on getting the fit right rather than on returns.',
    sections: [
      {
        heading: 'One free alteration',
        paragraphs: [
          'Every order includes one free alteration per abaya. Contact support within 7 days of delivery with your order number and a short description (and photos, if possible) of what needs adjusting.',
          'We arrange pickup where our courier partner serves your pincode, or reimburse reasonable courier charges up to [₹ amount] if you send it yourself.',
        ],
      },
      {
        heading: 'If something is wrong',
        list: [
          'Damaged, defective or not made to the confirmed specification: we remake it at no cost or refund you in full.',
          'Made to measurements you provided that were entered incorrectly: we offer the free alteration; a remake may be charged at [x]% of the item price.',
          'Report any issue within 7 days of delivery. Keep the abaya unworn, unwashed and with its tags.',
        ],
      },
      {
        heading: 'Change of mind',
        paragraphs: [
          'Because each piece is made to order, we cannot accept returns for change of mind once production has started (stage “Design confirmed” or later). You can cancel for a full refund before that stage by contacting support.',
        ],
      },
      {
        heading: 'Refunds',
        paragraphs: [
          'Approved refunds go back to your original payment method through Razorpay, usually within 5–7 working days of approval, depending on your bank.',
        ],
      },
    ],
  },
  shipping: {
    title: 'Shipping',
    description: 'Making time, delivery time, charges and tracking.',
    updated: '1 October 2026',
    intro: 'We ship across India through trusted courier partners.',
    sections: [
      {
        heading: 'Making time',
        paragraphs: [
          'Each design shows its making time on the product page (usually 10–15 days). It starts when our atelier confirms your specification after payment.',
        ],
      },
      {
        heading: 'Delivery time',
        paragraphs: [
          'After your abaya passes quality check it ships within 1–2 working days. Delivery usually takes 3–7 working days depending on your location.',
        ],
      },
      {
        heading: 'Charges',
        paragraphs: ['Shipping charges, if any, are shown at checkout before you pay. [Confirm free-shipping threshold.]'],
      },
      {
        heading: 'Tracking',
        paragraphs: [
          'You can follow every production stage on your order page. Once shipped, the page shows the courier, tracking number and a tracking link.',
        ],
      },
      {
        heading: 'Undeliverable parcels',
        paragraphs: [
          'If a parcel is returned to us because the address was incomplete or nobody was available after multiple attempts, re-shipping may be charged.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy notice',
    description:
      'What personal data we collect, including body measurements, why we use it, how long we keep it and your rights under the DPDP Act, 2023.',
    updated: '1 October 2026',
    intro:
      'This notice explains how [Legal entity name] (“we”) processes your personal data as a Data Fiduciary under India’s Digital Personal Data Protection Act, 2023 (“DPDP Act”). We ask for your consent when you create an account, and you can withdraw it at any time.',
    sections: [
      {
        heading: 'What we collect',
        list: [
          'Account details: name, email address, mobile number and login information.',
          'Delivery addresses you save.',
          'Body measurements you enter (height, bust, waist, hips, shoulder, sleeve, full length, wrist) and any notes for the tailor.',
          'Orders, the designs and options you chose, payment status and references (card and UPI details are handled by Razorpay; we never see or store them).',
          'Your wishlist and bag.',
          'Consent records (what you agreed to, which policy version, when) and basic technical logs for security.',
        ],
      },
      {
        heading: 'Why we use it',
        list: [
          'To make your abaya: your measurements and chosen options are shared with the partner tailor assigned to your order. Tailors never see your phone number, email or full address.',
          'To deliver it: your name, phone and address are shared with our courier partner.',
          'To take payment and issue refunds through Razorpay.',
          'To send order updates and, only if you opted in, occasional news about new designs.',
          'To keep the platform secure, prevent fraud and meet legal and tax obligations.',
        ],
      },
      {
        heading: 'How long we keep it',
        list: [
          'Account, addresses and measurement profiles: while your account is active, and deleted when you delete your account.',
          'Order records (including the copy of measurements used for that order): kept for [8] years for accounting and tax law, with your personal details removed if you delete your account.',
          'Consent and security logs: [x] years.',
        ],
      },
      {
        heading: 'Your rights',
        list: [
          'Access and portability: download a copy of your data at any time from Account → Privacy & data.',
          'Correction: edit your profile, addresses and measurements from your account, or ask support.',
          'Erasure: delete your account from Account → Privacy & data. If an order is still being made, we will ask you to wait until it is delivered.',
          'Withdraw consent: for marketing at any time; withdrawing consent for order processing means we can no longer make orders for you.',
          'Grievance redressal: contact our Grievance Officer (see below). If you are not satisfied, you may complain to the Data Protection Board of India.',
          'Nominate: you may nominate a person to exercise your rights in case of death or incapacity by writing to us.',
        ],
      },
      {
        heading: 'Security',
        paragraphs: [
          'Data is stored with our cloud providers with encryption in transit and at rest. Measurement and production photos are kept in private storage and shared only through short-lived links.',
        ],
      },
      {
        heading: 'Grievance Officer',
        paragraphs: ['See our Grievance officer page for contact details. We respond within the timelines required by law.'],
      },
    ],
  },
  terms: {
    title: 'Terms of use',
    description: 'The terms that apply when you use this website and place an order.',
    updated: '1 October 2026',
    intro:
      'These terms govern your use of this website and app operated by [Legal entity name], [registered address] (“we”, “us”). By creating an account or placing an order you agree to them.',
    sections: [
      {
        heading: 'Made-to-order products',
        paragraphs: [
          'Designs are original work by our designers, reviewed and priced by us. Product images are representative; handmade pieces may vary slightly in colour and finish.',
          'You are responsible for the accuracy of the measurements you enter. Our measurement guide explains how to take them.',
        ],
      },
      {
        heading: 'Prices and payment',
        paragraphs: [
          'Prices are in Indian Rupees and inclusive of GST. The price charged is the one confirmed at checkout, calculated by our systems. Payments are processed by Razorpay.',
        ],
      },
      {
        heading: 'Orders and cancellations',
        paragraphs: [
          'An order is confirmed once payment is received. You can cancel for a full refund before production starts. See our Returns & alterations policy for everything after that.',
        ],
      },
      {
        heading: 'Your account',
        paragraphs: ['Keep your login secure. You are responsible for activity on your account. We may suspend accounts used for fraud or abuse.'],
      },
      {
        heading: 'Intellectual property',
        paragraphs: [
          'All designs, images and content on this site belong to us or our designers and may not be copied for commercial use.',
          'Images are shown for personal viewing while you shop. You may not download, screenshot, print or share them to copy, sell or advertise a design, or to have it made elsewhere. AI previews and try-ons are for your own personal use.',
          'Every image we publish, and every AI preview and try-on, carries an invisible mark that identifies where it came from. We use it to find copies and to ask for them to be taken down.',
        ],
      },
      {
        heading: 'Liability and law',
        paragraphs: [
          'To the extent permitted by law, our liability for any order is limited to the amount you paid for it. These terms are governed by the laws of India; courts at [city] have jurisdiction.',
        ],
      },
    ],
  },
  grievance: {
    title: 'Grievance officer',
    description:
      'Contact details of our Grievance Officer under the Consumer Protection (E-Commerce) Rules, 2020 and the DPDP Act, 2023.',
    updated: '1 October 2026',
    intro:
      'In accordance with the Consumer Protection (E-Commerce) Rules, 2020 and the Digital Personal Data Protection Act, 2023, the details of our Grievance Officer are below.',
    sections: [
      {
        heading: 'Grievance Officer',
        list: [
          'Name: [Full name]',
          'Designation: [Designation]',
          'Email: [grievance@yourdomain.in]',
          'Phone: [+91 XXXXX XXXXX] (Monday to Friday, 10 am – 6 pm IST)',
          'Address: [Registered office address]',
        ],
      },
      {
        heading: 'Seller details',
        list: ['Legal name: [Legal entity name]', 'Registered address: [Address]', 'GSTIN: [GSTIN]', 'CIN / registration: [Number]'],
      },
      {
        heading: 'How we handle complaints',
        list: [
          'We acknowledge every complaint within 48 hours.',
          'We aim to resolve complaints within one month of receipt.',
          'Please include your order number and a description of the issue.',
        ],
      },
    ],
  },
};

/**
 * Messages for API error codes, shown instead of the API's own (English) text. English pages use
 * the API's text, so this stays empty here; strings.ar.ts has the Arabic for every code.
 */
export const apiErrors: Partial<Record<string, string>> = {};

/** The fixed AI-picture failure messages (by their English text); Arabic in strings.ar.ts. */
export const aiPictureErrors: Partial<Record<string, string>> = {};

/** Currency names in the switch. */
export const currencyNames = { INR: 'INR', AED: 'AED', SAR: 'SAR' };
