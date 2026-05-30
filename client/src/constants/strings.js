export const S = {
  app: {
    name: 'Åkaren TMS',
    tagline: 'Transportstyrning för åkerinäringen',
  },

  header: {
    brand: 'ÅKAREN',
    product: 'TMS',
    statusLabel: 'aktiv',
    historyAriaLabel: 'Visa offerthistorik',
  },

  inquiry: {
    heading: 'Ny transportförfrågan',
    label: 'Beskriv transporten',
    placeholder:
      'T.ex. "Flytta 5 ton stål från Hammarby Sjöstad till Solna industriområde den 20 juni, kräver kran vid lossning."',
    submit: 'Beräkna offert',
    submitting: 'Bearbetar…',
    clear: 'Rensa',
  },

  quote: {
    heading: 'Offertunderlag',
    saveButton: 'Spara uppdrag',
    saving: 'Sparar…',
    saved: 'Uppdrag sparat',
    exportButton: 'Exportera PDF',
    newQuoteButton: 'Ny förfrågan',

    fields: {
      lasttyp:             'Lasttyp',
      vikt:                'Vikt',
      upphämtning:         'Upphämtning',
      leverans:            'Leverans',
      datum:               'Datum',
      fordon_rekommenderat:'Rekommenderat fordon',
      avstand_km:          'Avstånd',
      bränsle_kostnad:     'Bränsle',
      arbetstid_timmar:    'Arbetstid',
      arbetstid_kostnad:   'Arbetstidskostnad',
      totalpris_sek:       'Totalpris',
      noteringar:          'Noteringar',
    },

    units: { km: 'km', sek: 'kr', timmar: 'tim' },

    table: {
      beskrivning: 'Beskrivning',
      antal:       'Antal',
      apris:       'À-pris',
      belopp:      'Belopp',
      total:       'Totalt exkl. moms',
    },

    lineItems: {
      transport:   'Transport',
      bränsle:     'Bränsletillägg',
      arbetstid:   'Arbetstid',
    },

    labels: {
      from:        'Från',
      to:          'Till',
      date:        'Datum',
      issued:      'Datum',
      validUntil:  'Giltig till',
      draft:       'UTKAST',
    },

    banners: {
      lez:       'LEZ-VARNING — Destination inom Stockholms Miljözon. Kontrollera fordonets utsläppsklass.',
      tillstand: 'Dispensansökan kan krävas för detta uppdrag.',
    },
  },

  sidebar: {
    heading:  'OFFERTHISTORIK',
    empty:    'Inga sparade offerter ännu.',
    loading:  'Laddar…',
    closeAriaLabel: 'Stäng historik',
  },

  job: {
    saved: 'Uppdraget har sparats.',
    saveError: 'Kunde inte spara uppdraget.',
    status: { planerad: 'Planerad', aktiv: 'Aktiv', avslutad: 'Avslutad' },
  },

  fleet: {
    heading: 'Fordonsflotta',
    labels: {
      maxLast:    'Max last',
      volym:      'Volym',
      priskm:     'Pris/km',
      startavgift:'Startavgift',
      lez:        'LEZ OK',
      tillstand:  'Tillstånd krävs',
    },
    units: { kg: 'kg', ton: 'ton', m3: 'm³', sek_km: 'kr/km', sek: 'kr' },
  },

  errors: {
    network:     'Något gick fel — kontrollera din internetanslutning.',
    parse:       'Beräkningen misslyckades — försök igen.',
    emptyInquiry:'Ange en förfrågan innan du skickar.',
    saveError:   'Kunde inte spara offerten.',
  },
};
