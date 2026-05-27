import fs from 'fs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

async function createFormPdf() {
  console.log('📝 Creating Editable PDF Form...');

  try {
    const templatePath = './used-vechile-report.jpeg';
    if (!fs.existsSync(templatePath)) {
      console.error('❌ Template not found');
      return;
    }

    const pdfDoc = await PDFDocument.create();
    const imageBuffer = fs.readFileSync(templatePath);
    const image = await pdfDoc.embedJpg(imageBuffer);
    
    const page = pdfDoc.addPage([612, 792]);
    page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });

    const form = pdfDoc.getForm();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Load the field map to create matching form fields
    const configPath = './config/pdfFieldMap.json';
    const fieldMap = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    for (const [name, field] of Object.entries(fieldMap)) {
      if (name === 'vinSettings' || name === 'vinArea') continue;

      const textField = form.createTextField(name);
      textField.setText(name.toUpperCase());
      textField.addToPage(page, {
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        font: helvetica,
        textColor: rgb(0, 0, 1), // Blue text so they see it's a field
        backgroundColor: rgb(0.9, 0.9, 0.9), // Light gray background
      });
    }

    const pdfBytes = await pdfDoc.save();
    const outputPath = './editable-template-form.pdf';
    fs.writeFileSync(outputPath, pdfBytes);

    console.log(`✅ Editable PDF Form created at: ${outputPath}`);
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

createFormPdf();
