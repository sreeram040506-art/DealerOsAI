const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const inputPath = path.resolve(__dirname, '../public/UsedVehicleRecord_Exact.docx');
const outputPath = path.resolve(__dirname, '../server/used-vehicle-report.docx');

if (!fs.existsSync(inputPath)) {
  console.error('Input file not found:', inputPath);
  process.exit(1);
}

const content = fs.readFileSync(inputPath, 'binary');
const zip = new PizZip(content);

let xml = zip.file("word/document.xml").asText();

// We need to inject tags. The document uses <w:u w:val="single"/> followed by spaces for underlines.
// We can find the labels and replace their adjacent underlines with {tagName}.

const replacements = [
  { label: 'Mrs. Model Year: ', tag: '{year}' },
  { label: 'Make: ', tag: '{make}' },
  { label: 'Model: ', tag: '{model}' },
  { label: 'Color: ', tag: '{color}' },
  { label: 'Obtained From \\(Source\\): ', tag: '{sourceName}' },
  { label: 'Transaction Date: ', tag: '{transactionDate}' },
  { label: 'Address \\(number and street\\): ', tag: '{address}' },
  { label: 'City or Town: ', tag: '{city}' },
  { label: 'State: ', tag: '{state}' },
  { label: 'Zip Code: ', tag: '{zipCode}' },
  { label: 'Odometer In: ', tag: '{mileage}' },
  { label: 'obtained from: ', tag: '{sourceRepeater}' },
];

for (const rep of replacements) {
  // Matches the label, then possibly some XML tags closing/opening, then an underline tag, then spaces.
  // Actually, we can just replace the spaces inside the next <w:u> element after the label.
  
  // E.g., <w:t xml:space="preserve">Mrs. Model Year: </w:t></w:r><w:r><w:rPr><w:rFonts.../><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">              </w:t>
  
  const regex = new RegExp(`(${rep.label}</w:t>.*?</w:r>.*?<w:u w:val="single"/>.*?</w:rPr><w:t[^>]*>)[\\s_]+(</w:t>)`, 'g');
  xml = xml.replace(regex, `$1${rep.tag}$2`);
}

// Special case for stock no which might be in the upper right. 
// "Stock No." cell is: <w:t>Stock No.</w:t></w:r></w:p></w:tc><w:tc>...<w:p>...
// I'll just find "Stock No." and the next cell and inject {stockNo}
xml = xml.replace(/(Stock No\.<\/w:t><\/w:r><\/w:p><\/w:tc>.*?<w:tc>.*?)(<\/w:p>)/, `$1<w:r><w:t>{stockNo}</w:t></w:r>$2`);

// Special case for the VIN table.
// It has 17 consecutive cells with <w:tc>...<w:p...><w:jc w:val="center"/></w:p></w:tc>
// I will just find the consecutive 17 empty center-justified paragraphs in table cells and inject {v1}, {v2}...
let vinCellIdx = 0;
xml = xml.replace(/<w:tc>(<w:tcPr>.*?<\/w:tcPr>)<w:p [^>]+><w:pPr><w:jc w:val="center"\/><\/w:pPr><\/w:p><\/w:tc>/g, (match, prefix) => {
    if(vinCellIdx < 17) {
        let replacement = `<w:tc>${prefix}<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{v${vinCellIdx}}</w:t></w:r></w:p></w:tc>`;
        vinCellIdx++;
        return replacement;
    }
    return match;
});

// Update the XML in the zip
zip.file("word/document.xml", xml);

// Also replace the repeater "The source of the motor vehicle or part indicated it was obtained from: " text
// "The source of the motor vehicle or part indicated it was obtained from: " -> replacing underline after it.
const regexRepeater = /(The source of the motor vehicle or part indicated it was obtained from: <\/w:t>.*?<\/w:r>.*?<w:u w:val="single"\/>.*?<\/w:rPr><w:t[^>]*>)[\s_]+(<\/w:t>)/g;
xml = xml.replace(regexRepeater, `$1{sourceRepeater}$2`);


zip.file("word/document.xml", xml);

const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(outputPath, buffer);

console.log('Template created at', outputPath);
