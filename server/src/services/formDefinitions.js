// The forms a customer or mechanic fills in through a link. The same definition drives the
// public page (it is sent to the browser), the server-side validation and the PDF layout.

const text = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const tel = (key, label, extra = {}) => ({ key, label, type: 'tel', ...extra });
const email = (key, label, extra = {}) => ({ key, label, type: 'email', ...extra });
const date = (key, label, extra = {}) => ({ key, label, type: 'date', ...extra });
const money = (key, label, extra = {}) => ({ key, label, type: 'number', ...extra });
const choice = (key, label, options, extra = {}) => ({ key, label, type: 'radio', options, ...extra });
const area = (key, label, extra = {}) => ({ key, label, type: 'textarea', ...extra });

const personFields = (prefix, required) => [
  text(`${prefix}Name`, 'Full legal name', { required }),
  date(`${prefix}Dob`, 'Date of birth', { required }),
  text(`${prefix}License`, "Driver's license number", { required }),
  text(`${prefix}LicenseState`, 'License state', { required, max: 2, half: true }),
  text(`${prefix}Address`, 'Street address', { required, full: true }),
  text(`${prefix}City`, 'City', { required }),
  text(`${prefix}State`, 'State', { required, max: 2, half: true }),
  text(`${prefix}Zip`, 'ZIP', { required, max: 10, half: true }),
  tel(`${prefix}Phone`, 'Phone', { required }),
  email(`${prefix}Email`, 'Email'),
];

const CHECK = ['OK', 'Needs repair', 'Replaced', 'N/A'];
const checklist = (title, items) => ({
  title,
  fields: items.map(([key, label]) => choice(key, label, CHECK, { inline: true })),
});

export const FORMS = {
  PURCHASE_CONTRACT: {
    title: 'Motor Vehicle Purchase Contract',
    registryType: 'Purchase Contract',
    audience: 'customer',
    intro: 'Please fill in your details. The vehicle and price shown were set by the dealership. Review everything, then sign at the bottom.',
    needsSignature: true,
    consent: 'I have read this contract and the Buyers Guide displayed on the vehicle. I agree to the price and terms shown and confirm the information above is correct.',
    sections: [
      { title: 'Buyer', fields: personFields('buyer', true) },
      {
        title: 'Co-buyer (optional)',
        fields: [text('coName', 'Full legal name'), date('coDob', 'Date of birth'), tel('coPhone', 'Phone'), email('coEmail', 'Email'), text('coLicense', "Driver's license number")],
      },
      {
        title: 'Trade-in (optional)',
        fields: [
          text('tradeYear', 'Year', { max: 4, half: true }), text('tradeMake', 'Make'), text('tradeModel', 'Model'),
          text('tradeVin', 'VIN', { max: 17 }), text('tradeMileage', 'Odometer (miles)'), money('tradePayoff', 'Amount still owed on it ($)'),
        ],
      },
      {
        title: 'Payment',
        fields: [
          choice('paymentMethod', 'How will you pay?', ['Cash', 'Check', 'Card', 'Dealer financing', 'Outside financing'], { required: true }),
          text('lender', 'Bank or lender (if financing)'),
          money('cashDown', 'Cash down payment ($)'),
        ],
      },
    ],
  },

  LOAN_APPLICATION: {
    title: 'Vehicle Credit Application',
    registryType: 'Loan Application',
    audience: 'customer',
    intro: 'This application is shared with lenders to arrange your financing. Only the last 4 digits of your Social Security number are asked for here; the lender collects the rest securely.',
    sensitive: true,
    needsSignature: true,
    consent: 'I certify the information above is true and complete. I authorise the dealer and the lenders it submits this application to, to obtain consumer reports and verify my employment, income and credit history, and to share this application with lenders to arrange financing. I understand the dealer may be paid for arranging financing and that submitting this does not guarantee approval.',
    sections: [
      {
        title: 'Applicant',
        fields: [
          ...personFields('applicant', true),
          text('applicantSsn4', 'Social Security number — last 4 digits', { required: true, max: 4, pattern: '^\\d{4}$' }),
          text('applicantYearsAtAddress', 'Years at this address', { half: true }),
          choice('applicantHousing', 'Housing', ['Own', 'Rent', 'Other'], { inline: true }),
          money('applicantHousingPayment', 'Monthly rent or mortgage ($)'),
          text('applicantPreviousAddress', 'Previous address (if under 2 years)', { full: true }),
        ],
      },
      {
        title: 'Employment and income',
        fields: [
          text('employer', 'Employer', { required: true }), text('jobTitle', 'Job title'), text('employerPhone', 'Employer phone'),
          text('timeAtJob', 'Time at job'), money('monthlyIncome', 'Gross monthly income ($)', { required: true }),
          money('otherIncome', 'Other monthly income ($)'), text('otherIncomeSource', 'Source of other income'),
        ],
      },
      {
        title: 'Co-applicant (optional)',
        fields: [
          text('coName', 'Full legal name'), date('coDob', 'Date of birth'), text('coSsn4', 'Social Security number — last 4 digits', { max: 4, pattern: '^\\d{4}$' }),
          tel('coPhone', 'Phone'), email('coEmail', 'Email'), text('coAddress', 'Street address', { full: true }),
          text('coEmployer', 'Employer'), money('coMonthlyIncome', 'Gross monthly income ($)'),
        ],
      },
      {
        title: 'Vehicle financing',
        fields: [money('tradeValue', 'Trade-in value ($)'), money('tradePayoff', 'Amount owed on trade-in ($)'), money('cashDown', 'Cash down ($)')],
      },
      {
        title: 'References (people not living with you)',
        fields: [
          text('ref1Name', 'Reference 1 name'), text('ref1Relationship', 'Relationship'), tel('ref1Phone', 'Phone'),
          text('ref2Name', 'Reference 2 name'), text('ref2Relationship', 'Relationship'), tel('ref2Phone', 'Phone'),
        ],
      },
    ],
  },

  INSPECTION_REPORT: {
    title: 'Used Vehicle Inspection Report',
    registryType: 'Inspection Report',
    audience: 'mechanic',
    intro: 'Inspect the vehicle shown and mark each item. Add notes for anything that needs work, then submit.',
    needsSignature: false,
    consent: 'I inspected this vehicle and the results above are accurate to the best of my knowledge.',
    sections: [
      {
        title: 'Inspector',
        fields: [text('inspectorName', 'Your name', { required: true }), text('shop', 'Shop / company'), date('inspectionDate', 'Inspection date', { required: true }), text('odometer', 'Odometer reading (miles)', { required: true })],
      },
      checklist('Engine and drivetrain', [
        ['oil', 'Engine oil level / leaks'], ['coolant', 'Coolant level / hoses'], ['belts', 'Belts and pulleys'], ['battery', 'Battery and terminals'],
        ['transmission', 'Transmission fluid / shifting'], ['exhaust', 'Exhaust system'], ['axles', 'CV joints / axles'], ['codes', 'Check-engine light / stored codes'],
      ]),
      checklist('Brakes and suspension', [
        ['frontBrakes', 'Front brake pads / rotors'], ['rearBrakes', 'Rear brake pads / rotors / drums'], ['brakeFluid', 'Brake fluid'], ['shocks', 'Shocks and struts'],
        ['joints', 'Ball joints / tie rods'], ['bearings', 'Wheel bearings'], ['steering', 'Steering feel / power steering'],
      ]),
      checklist('Tires and wheels', [['tread', 'Tire tread depth'], ['tireAge', 'Tire age and condition'], ['wheels', 'Wheels / hubcaps'], ['spare', 'Spare tire and jack']]),
      checklist('Lights, glass and body', [
        ['headlights', 'Headlights / high beam'], ['taillights', 'Brake and tail lights'], ['signals', 'Turn signals / hazards'], ['glass', 'Windshield / glass'],
        ['wipers', 'Wipers and washers'], ['body', 'Body panels / paint'], ['collision', 'Signs of previous collision'],
      ]),
      checklist('Interior and safety', [
        ['belts2', 'Seat belts'], ['airbag', 'Airbag light'], ['horn', 'Horn'], ['hvac', 'Heat / A/C'], ['windows', 'Windows / locks'], ['controls', 'Radio / controls'],
        ['seats', 'Seats / carpet condition'], ['odoWorks', 'Odometer working'],
      ]),
      {
        title: 'Result',
        fields: [
          choice('testDrive', 'Test drive', ['Passed', 'Passed with notes', 'Failed'], { inline: true }),
          choice('overall', 'Overall result', ['Ready for sale', 'Repairs needed first', 'Do not sell'], { required: true, inline: true }),
          money('repairEstimate', 'Estimated repair cost ($)'),
          area('notes', 'Notes', { full: true, max: 2000 }),
        ],
      },
    ],
  },
};

export const FORM_TYPES = Object.keys(FORMS);

export function allFields(form) {
  return form.sections.flatMap((section) => section.fields);
}

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

/**
 * Validates submitted answers against the form definition. Unknown keys are dropped, values are
 * length-limited, radios must be one of their options. Returns { data } or { errors }.
 */
export function validateSubmission(form, body) {
  const errors = {};
  const data = {};
  for (const field of allFields(form)) {
    const raw = body?.[field.key];
    const max = field.max || (field.type === 'textarea' ? 2000 : 120);
    const value = clean(raw, max);
    if (!value) {
      if (field.required) errors[field.key] = `${field.label} is required.`;
      continue;
    }
    if (field.type === 'radio' && !field.options.includes(value)) { errors[field.key] = `Choose one of the listed options for ${field.label}.`; continue; }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { errors[field.key] = 'Enter a valid email address.'; continue; }
    if (field.type === 'number' && !(Number.isFinite(Number(value)) && Number(value) >= 0)) { errors[field.key] = `${field.label} must be a number.`; continue; }
    if (field.type === 'date' && Number.isNaN(Date.parse(value))) { errors[field.key] = `${field.label} must be a date.`; continue; }
    if (field.pattern && !new RegExp(field.pattern).test(value)) { errors[field.key] = `${field.label} is not in the expected format.`; continue; }
    data[field.key] = value;
  }
  if (form.needsSignature) {
    const signature = clean(body?.signature, 120);
    if (!signature) errors.signature = 'Type your full name to sign.';
    else data.signature = signature;
  }
  if (body?.consent !== true) errors.consent = 'Please tick the box to confirm.';
  return Object.keys(errors).length ? { errors } : { data };
}

/** What the browser needs to draw the form: no validation internals beyond what the inputs use. */
export function publicDefinition(form) {
  return {
    title: form.title,
    audience: form.audience,
    intro: form.intro,
    needsSignature: form.needsSignature,
    consent: form.consent,
    sections: form.sections,
  };
}
