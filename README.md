# Proof of Address Letter Generator

A small, dependency-light web app that turns a form into a clean **proof of address declaration letter**. Fill in your details, watch the letter update live, then download it as a **PDF** or **DOCX**, or print it.

It runs entirely in the browser. There is no backend, no account, no tracking, and nothing is uploaded or stored.

<!-- Add a screenshot: ![Screenshot](docs/screenshot.png) -->

## What it is (and is not)

This tool creates a **self-declaration**: a letter in which a person states where they live, optionally confirmed by a landlord or householder who signs the printed copy. The letter says so on its face.

It does **not** create utility bills, bank statements, tenancy agreements, government letters or anything that imitates an official issuer, and it adds no seals, stamps or crests. Many organisations accept only official documents, so check what yours requires. See [Responsible use](#responsible-use).

## Features

- **Live preview** of an A4 letter that updates as you type
- **Export** to PDF (selectable text, page footers) or DOCX (real tables, page numbers). The live app address is printed at the very bottom of every exported page
- **Scenario selection**: tick any mix of *no utility bills*, *no written contract (verbal agreement)*, *long-term resident* and *living with family or a host*. The letter adds a "Circumstances" section, adapts its subtitle and landlord wording, and calculates length of residence
- **Form fields**: full name, date of birth, National ID or passport number, phone, personal email, present address and move-in date, optional permanent address (same fields as the present address), spouse (name, mobile, email), landlord or householder (printed name, mobile, email, relationship), recipient, purpose
- **Present and permanent address** share the same fields. Ticking "Add a permanent address" shows the two sections side by side, with a button to copy the present address across
- **Optional landlord confirmation block** with its own signature line. Leave it empty and the letter omits it. If you fill it in, a name plus a mobile number or email is required
- **Automatic reference number** in the form `POA-YYYYMMDD-HHMMSS`, refreshed on every export or print
- **Validation** for required fields, email format and move-in dates in the future
- Responsive layout, dark mode, keyboard-friendly, print stylesheet
- Manual **light/dark mode** toggle that remembers your choice (follows your system setting until you pick)
- **Terms of use** dialog on first visit: the user must scroll to the end and accept before using the app (the acceptance is remembered in the browser)
- Blank signature lines on the letter, for signing by hand after printing
- Site icon (`favicon.svg` and an Apple touch icon)

Live app: https://tasmon.github.io/Addrex

## Quick start

No build step is needed.

```bash
git clone https://github.com/<your-username>/proof-of-address.git
cd proof-of-address
# open index.html in a browser, or serve the folder:
python3 -m http.server 8000   # then visit http://localhost:8000
```

Opening `index.html` directly from disk works too.

### Deploy

It is a static site, so it works on **GitHub Pages**, Vercel, Netlify or any static host. For GitHub Pages: *Settings → Pages → Deploy from branch → `main` / root*.

## Project structure

```
.
├── index.html               # Page markup and form
├── style.css                # UI styles, letter styles, print styles
├── script.js                # Form handling, validation, export buttons
├── poa-core.js              # Document model and exporters (HTML, text, PDF, DOCX)
├── favicon.svg              # Site icon
├── apple-touch-icon.png     # Icon for iOS home screens
└── vendor/
    └── jspdf.umd.min.js     # jsPDF 2.5.2 (MIT), bundled for offline use
```

## How it works

`poa-core.js` has no DOM access. It builds one **document model** (title, metadata, sections, signature blocks, note) from the form data, then renders that same model three ways:

| Output | How it is produced |
| --- | --- |
| Preview | Escaped HTML string |
| PDF | jsPDF vector text on A4 with automatic page breaks and footers |
| DOCX | Hand-built OOXML packaged in a ZIP with a small built-in writer, no library |

Because every output comes from the same model, they stay consistent. To change the wording or sections of the letter, edit `buildDoc()` in `poa-core.js`.

The core file also works in Node (`require('./poa-core.js')`), which is handy for tests.

## Customising

- **Letter wording and sections**: `buildDoc()` in `poa-core.js`
- **Terms of use**: the text is in the `<dialog id="terms">` block in `index.html`. Change `TVER` in `script.js` to make everyone accept again after you edit it
- **Address in exported files**: `APP_URL` in `poa-core.js`
- **Colours and typography**: CSS variables at the top of `style.css`
- **Scenarios**: add a checkbox tile in `index.html`, read it in `scenarios()` in `script.js`, and add its paragraph in `buildDoc()`
- **Paper size**: the PDF and print layouts use A4. Change `format` in `toPDF()` and `@page` in `style.css` for Letter

## Known limitations

- **PDF and non-Latin text**: the PDF export uses jsPDF's built-in fonts, which cannot embed scripts such as Bangla or Arabic. When the app detects those characters it tells you to use the DOCX export instead, which handles any script.
- **DOCX fonts**: the document asks for Georgia and Calibri. Word substitutes similar fonts if they are missing.
- Signature lines are left blank on purpose. Print the letter and sign it by hand. There is no digital signature.
- Data is not saved between visits. Reloading the page clears the form.

## Troubleshooting

**"The PDF library could not be loaded"**: `vendor/jspdf.umd.min.js` was not found. Make sure the `vendor` folder is uploaded next to `index.html` (check it is not excluded by `.gitignore` or a zip tool), then reload. You can confirm in the browser's developer tools, where the Network tab shows a 404 for that file. The DOCX download works either way.

## Privacy

All processing happens locally in your browser. The form data, including ID numbers and contact details, is never sent anywhere. The app loads no fonts or analytics. Its only script dependency, jsPDF, is bundled in `vendor/`. If that file cannot be found, the app tries the same folder and then, as a last resort, a copy from the jsDelivr CDN.

## Responsible use

Use this tool only to describe your **own true circumstances**. Provide accurate details and have the landlord or householder confirm only what is true. Do not use it to misrepresent where someone lives, to impersonate an official document or issuer, or to make a document for another person without their knowledge. Forged or false residence documents can have legal consequences, and organisations may contact the person named as landlord to verify the letter.

This software is not legal advice, and a letter made with it is not guaranteed to be accepted by any organisation.

## Licence

Add your preferred licence here, for example MIT, in a `LICENSE` file.

Bundled third-party software: [jsPDF](https://github.com/parallax/jsPDF) is licensed under the MIT licence.
