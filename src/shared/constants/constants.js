import ledgering from "../../assets/method-icons/ledgering.png";
import feeder from "../../assets/method-icons/feeder.png";
import float from "../../assets/method-icons/float.png";
import spinning from "../../assets/method-icons/spinning.png";
import flyFishing from "../../assets/method-icons/flyFishing.png";
import winterFishing from "../../assets/method-icons/winterFishing.png";
export const DEFAULT_SPECIES = [
  // =========================
  // KAPROVITÉ (CYPRINIDS)
  // =========================

  {
    key: "commonCarp",
    label: "Kapr obecný",
    latinName: "Cyprinus carpio",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "crucianCarp",
    label: "Karas obecný",
    latinName: "Carassius carassius",
    categoryKey: "cyprinids",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "prussianCarp",
    label: "Karas stříbřitý",
    latinName: "Carassius gibelio",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "grassCarp",
    label: "Amur bílý",
    latinName: "Ctenopharyngodon idella",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "blackAmur",
    label: "Amur černý",
    latinName: "Mylopharyngodon piceus",
    categoryKey: "cyprinids",
    isCommon: false,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "tench",
    label: "Lín obecný",
    latinName: "Tinca tinca",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "commonBream",
    label: "Cejn velký",
    latinName: "Abramis brama",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "blueBream",
    label: "Cejn siný",
    latinName: "Ballerus ballerus",
    categoryKey: "cyprinids",
    isCommon: false,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "whiteEyeBream",
    label: "Cejn perleťový",
    latinName: "Ballerus sapa",
    categoryKey: "cyprinids",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "vimbaBream",
    label: "Podoustev říční",
    latinName: "Vimba vimba",
    categoryKey: "cyprinids",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "whiteBream",
    label: "Cejnek malý",
    latinName: "Blicca bjoerkna",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "roach",
    label: "Plotice obecná",
    latinName: "Rutilus rutilus",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "rudd",
    label: "Perlín ostrobřichý",
    latinName: "Scardinius erythrophthalmus",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "ide",
    label: "Jelec jesen",
    latinName: "Leuciscus idus",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "dace",
    label: "Jelec proudník",
    latinName: "Leuciscus leuciscus",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "chub",
    label: "Jelec tloušť",
    latinName: "Squalius cephalus",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "asp",
    label: "Bolen dravý",
    latinName: "Leuciscus aspius",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: true,
  },

  {
    key: "nase",
    label: "Ostroretka stěhovavá",
    latinName: "Chondrostoma nasus",
    categoryKey: "cyprinids",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "barbel",
    label: "Parma obecná",
    latinName: "Barbus barbus",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "gudgeon",
    label: "Hrouzek obecný",
    latinName: "Gobio gobio",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "danubianGudgeon",
    label: "Hrouzek Kesslerův",
    latinName: "Romanogobio kesslerii",
    categoryKey: "cyprinids",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "whitefinGudgeon",
    label: "Hrouzek běloploutvý",
    latinName: "Romanogobio vladykovi",
    categoryKey: "cyprinids",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "minnow",
    label: "Střevle potoční",
    latinName: "Phoxinus phoxinus",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "bleak",
    label: "Ouklej obecná",
    latinName: "Alburnus alburnus",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "schneider",
    label: "Ouklejka pruhovaná",
    latinName: "Alburnoides bipunctatus",
    categoryKey: "cyprinids",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "sunbleak",
    label: "Hořavka duhová",
    latinName: "Rhodeus amarus",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "topmouthGudgeon",
    label: "Střevlička východní",
    latinName: "Pseudorasbora parva",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },
  {
    key: "silverCarp",
    label: "Tolstolobik bílý",
    latinName: "Hypophthalmichthys molitrix",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },
  {
    key: "bigheadCarp",
    label: "Tolstolobik pestrý",
    latinName: "Hypophthalmichthys nobilis",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "hybridSilverBigheadCarp",
    label: "Tolstolobik bílý / pestrý",
    latinName: "Hypophthalmichthys spp.",
    categoryKey: "cyprinids",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  // =========================
  // PSTRUHOVITÉ
  // =========================

  {
    key: "brownTrout",
    label: "Pstruh obecný",
    latinName: "Salmo trutta",
    categoryKey: "salmonids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: true,
  },

  {
    key: "rainbowTrout",
    label: "Pstruh duhový",
    latinName: "Oncorhynchus mykiss",
    categoryKey: "salmonids",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: true,
  },

  {
    key: "brookTrout",
    label: "Siven americký",
    latinName: "Salvelinus fontinalis",
    categoryKey: "salmonids",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: true,
  },

  {
    key: "arcticChar",
    label: "Siven alpský",
    latinName: "Salvelinus alpinus",
    categoryKey: "salmonids",
    isCommon: false,
    isProtected: false,
    isNonNative: true,
    isPredator: true,
  },

  {
    key: "grayling",
    label: "Lipan podhorní",
    latinName: "Thymallus thymallus",
    categoryKey: "salmonids",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "huchen",
    label: "Hlavátka obecná",
    latinName: "Hucho hucho",
    categoryKey: "salmonids",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: true,
  },

  {
    key: "atlanticSalmon",
    label: "Losos obecný",
    latinName: "Salmo salar",
    categoryKey: "salmonids",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: true,
  },

  {
    key: "lakeTrout",
    label: "Pstruh jezerní",
    latinName: "Salmo trutta lacustris",
    categoryKey: "salmonids",
    isCommon: false,
    isProtected: false,
    isNonNative: false,
    isPredator: true,
  },
  // =========================
  // SUMCOVITÉ (CATFISH)
  // =========================

  {
    key: "welsCatfish",
    label: "Sumec velký",
    latinName: "Silurus glanis",
    categoryKey: "catfish",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: true,
  },

  {
    key: "blackBullhead",
    label: "Sumeček černý",
    latinName: "Ameiurus melas",
    categoryKey: "catfish",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "brownBullhead",
    label: "Sumeček americký",
    latinName: "Ameiurus nebulosus",
    categoryKey: "catfish",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "channelCatfish",
    label: "Sumeček kanálový",
    latinName: "Ictalurus punctatus",
    categoryKey: "catfish",
    isCommon: false,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  // =========================
  // ŠTIKOVITÉ (PIKE FAMILY)
  // =========================

  {
    key: "northernPike",
    label: "Štika obecná",
    latinName: "Esox lucius",
    categoryKey: "pikes",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: true,
  },

  // =========================
  // OKOUNOVITÉ (PERCH FAMILY)
  // =========================

  {
    key: "europeanPerch",
    label: "Okoun říční",
    latinName: "Perca fluviatilis",
    categoryKey: "perches",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: true,
  },

  {
    key: "zander",
    label: "Candát obecný",
    latinName: "Sander lucioperca",
    categoryKey: "perches",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: true,
  },

  {
    key: "volgaZander",
    label: "Candát východní",
    latinName: "Sander volgensis",
    categoryKey: "perches",
    isCommon: false,
    isProtected: false,
    isNonNative: true,
    isPredator: true,
  },

  {
    key: "ruffe",
    label: "Ježdík obecný",
    latinName: "Gymnocephalus cernua",
    categoryKey: "perches",
    isCommon: true,
    isProtected: false,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "danubeRuffe",
    label: "Ježdík dunajský",
    latinName: "Gymnocephalus baloni",
    categoryKey: "perches",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "stripedRuffe",
    label: "Ježdík žlutý",
    latinName: "Gymnocephalus schraetser",
    categoryKey: "perches",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "pumpkinseed",
    label: "Slunečnice pestrá",
    latinName: "Lepomis gibbosus",
    categoryKey: "perches",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },
  {
    key: "largemouthBass",
    label: "Okounek pstruhový",
    latinName: "Micropterus salmoides",
    categoryKey: "perches",
    isCommon: false,
    isProtected: false,
    isNonNative: true,
    isPredator: true,
  },
  // =========================
  // ÚHOŘOVITÍ (EELS)
  // =========================

  {
    key: "europeanEel",
    label: "Úhoř říční",
    latinName: "Anguilla anguilla",
    categoryKey: "eels",
    isCommon: true,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  // =========================
  // JESETEŘI (STURGEONS)
  // =========================

  {
    key: "sterlet",
    label: "Jeseter malý",
    latinName: "Acipenser ruthenus",
    categoryKey: "sturgeons",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "russianSturgeon",
    label: "Jeseter ruský",
    latinName: "Acipenser gueldenstaedtii",
    categoryKey: "sturgeons",
    isCommon: false,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "siberianSturgeon",
    label: "Jeseter sibiřský",
    latinName: "Acipenser baerii",
    categoryKey: "sturgeons",
    isCommon: false,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "atlanticSturgeon",
    label: "Jeseter velký",
    latinName: "Acipenser sturio",
    categoryKey: "sturgeons",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "belugaSturgeon",
    label: "Vyza velká",
    latinName: "Huso huso",
    categoryKey: "sturgeons",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "starrySturgeon",
    label: "Jeseter hvězdnatý",
    latinName: "Acipenser stellatus",
    categoryKey: "sturgeons",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "shipSturgeon",
    label: "Jeseter ostrorypý",
    latinName: "Acipenser nudiventris",
    categoryKey: "sturgeons",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  // =========================
  // MNÍKOVITÍ (BURBOT FAMILY)
  // =========================

  {
    key: "burbot",
    label: "Mník jednovousý",
    latinName: "Lota lota",
    categoryKey: "burbots",
    isCommon: false,
    isProtected: false,
    isNonNative: false,
    isPredator: true,
  },
  // =========================
  // HLAVÁČOVITÍ (GOBIIDAE)
  // =========================

  {
    key: "roundGoby",
    label: "Hlaváč černoústý",
    latinName: "Neogobius melanostomus",
    categoryKey: "gobies",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "bigheadGoby",
    label: "Hlaváč hlavatý",
    latinName: "Ponticola kessleri",
    categoryKey: "gobies",
    isCommon: true,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "monkeyGoby",
    label: "Hlaváč Kesslerův",
    latinName: "Neogobius fluviatilis",
    categoryKey: "gobies",
    isCommon: false,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  {
    key: "tubenoseGoby",
    label: "Hlaváčkovec mramorovaný",
    latinName: "Proterorhinus semilunaris",
    categoryKey: "gobies",
    isCommon: false,
    isProtected: false,
    isNonNative: true,
    isPredator: false,
  },

  // =========================
  // VRANKOVITÍ (COTTIDAE)
  // =========================

  {
    key: "bullhead",
    label: "Vranka obecná",
    latinName: "Cottus gobio",
    categoryKey: "sculpins",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "siberianBullhead",
    label: "Vranka pruhoploutvá",
    latinName: "Cottus poecilopus",
    categoryKey: "sculpins",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  // =========================
  // SEKAVCOVITÍ (COBITIDAE)
  // =========================

  {
    key: "weatherfish",
    label: "Piskoř pruhovaný",
    latinName: "Misgurnus fossilis",
    categoryKey: "loaches",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "spinedLoach",
    label: "Sekavec písečný",
    latinName: "Cobitis taenia",
    categoryKey: "loaches",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "goldenLoach",
    label: "Sekavec podunajský",
    latinName: "Sabanejewia balcanica",
    categoryKey: "loaches",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  // =========================
  // MIHULOVCI (LAMPREYS)
  // =========================

  {
    key: "brookLamprey",
    label: "Mihule potoční",
    latinName: "Lampetra planeri",
    categoryKey: "lampreys",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "danubeLamprey",
    label: "Mihule ukrajinská",
    latinName: "Eudontomyzon mariae",
    categoryKey: "lampreys",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },

  {
    key: "riverLamprey",
    label: "Mihule říční",
    latinName: "Lampetra fluviatilis",
    categoryKey: "lampreys",
    isCommon: false,
    isProtected: true,
    isNonNative: false,
    isPredator: false,
  },
];

export const SPECIES_CATEGORIES = [
  {
    key: "common",
    label: "⭐ Nejčastější úlovky",
  },

  {
    key: "cyprinids",
    label: "🐟 Kaprovité",
  },

  {
    key: "predators",
    label: "🦷 Dravci",
  },

  {
    key: "salmonids",
    label: "🏞️ Pstruhovité",
  },

  {
    key: "catfish",
    label: "🐋 Sumci",
  },

  {
    key: "eels",
    label: "🐍 Úhoři",
  },

  {
    key: "sturgeons",
    label: "🛡️ Jeseteři",
  },

  {
    key: "smallFish",
    label: "🐠 Drobné ryby",
  },

  {
    key: "protected",
    label: "🛑 Chráněné druhy",
  },

  {
    key: "nonNative",
    label: "🌍 Nepůvodní druhy",
  },
];

export const DEFAULT_METHODS = [
  {
    key: "ledgering",
    label: "Položená",
    icon: ledgering,
    isCustom: false,
  },
  {
    key: "feeder",
    label: "Feeder",
    icon: feeder,
    isCustom: false,
  },
  {
    key: "float",
    label: "Plavaná",
    icon: float,
    isCustom: false,
  },
  {
    key: "spinning",
    label: "Přívlač",
    icon: spinning,
    isCustom: false,
  },
  {
    key: "flyFishing",
    label: "Muškaření",
    icon: flyFishing,
    isCustom: false,
  },
  {
    key: "winterFishing",
    label: "Dírky",
    icon: winterFishing,
    isCustom: false,
  },
];
export const DEFAULT_BAITS = [
  { key: "corn", label: "Kukuřice", isCustom: false },
  { key: "boilies", label: "Boilies", isCustom: false },
  { key: "worms", label: "Červi", isCustom: false },
  { key: "pellets", label: "Pelety", isCustom: false },
  { key: "dough", label: "Těsto", isCustom: false },
  { key: "liveFish", label: "Živá rybka", isCustom: false },
  { key: "maggots", label: "Oparák", isCustom: false },
  { key: "other", label: "Jiná", isCustom: false },
];

export const MOON_PHASE_EMOJI = {
  new: "🌑 Nov",
  waxingCrescent: "🌒 Dorůstající srpek",
  firstQuarter: "🌓 První čtvrt",
  waxingGibbous: "🌔 Dorůstá",
  full: "🌕 Úplněk",
  waningGibbous: "🌖 Ubývá",
  lastQuarter: "🌗 Poslední čtvrt",
  waningCrescent: "🌘 Ubývající srpek",
};
