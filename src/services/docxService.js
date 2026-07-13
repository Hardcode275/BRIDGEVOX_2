const { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  AlignmentType, 
  WidthType, 
  BorderStyle,
  HeadingLevel
} = require('docx');

/**
 * Genera un buffer de documento de Word (.docx) con formato profesional para la transcripción.
 * 
 * @param {Object} data Datos para el reporte
 * @param {string} data.filename Nombre del archivo de audio original
 * @param {number} data.duration Duración en segundos
 * @param {string} data.language Idioma original
 * @param {string} data.transcript Texto transcrito
 * @param {string} [data.translation] Texto traducido (opcional)
 * @param {string} [data.targetLanguage] Idioma de traducción (opcional)
 * @returns {Promise<Buffer>} El buffer binario del archivo .docx
 */
async function generateDocxBuffer({ filename, duration, language, transcript, translation, targetLanguage }) {
  // Formatear la duración de forma amigable (MM:SS)
  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60);
  const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')} (${Math.round(duration)} segundos)`;

  // Mapear códigos de idioma a nombres legibles
  const langNames = {
    es: 'Español (es)',
    en: 'Inglés (en)',
    fr: 'Francés (fr)',
    de: 'Alemán (de)',
    it: 'Italiano (it)',
    pt: 'Portugués (pt)',
  };

  const sourceLangName = langNames[language] || language;
  const targetLangName = langNames[targetLanguage] || targetLanguage;
  const currentDate = new Date().toLocaleString();

  // Definir estilo de bordes para la tabla
  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
  };

  // Crear la tabla de metadatos
  const metaTable = new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: [
      // Fila de encabezado
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { fill: "1E293B" }, // Fondo oscuro
            borders: cellBorders,
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Propiedad", bold: true, color: "FFFFFF", font: "Calibri" })],
                alignment: AlignmentType.LEFT,
              })
            ],
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            shading: { fill: "1E293B" },
            borders: cellBorders,
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Detalle", bold: true, color: "FFFFFF", font: "Calibri" })],
                alignment: AlignmentType.LEFT,
              })
            ],
          })
        ]
      }),
      // Fila 1: Archivo
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Archivo Original", bold: true, color: "334155", font: "Calibri" })] })]
          }),
          new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: filename, font: "Calibri" })] })]
          })
        ]
      }),
      // Fila 2: Duración
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Duración de Audio", bold: true, color: "334155", font: "Calibri" })] })]
          }),
          new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: formattedDuration, font: "Calibri" })] })]
          })
        ]
      }),
      // Fila 3: Idioma
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Idioma de Audio", bold: true, color: "334155", font: "Calibri" })] })]
          }),
          new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: sourceLangName, font: "Calibri" })] })]
          })
        ]
      }),
      // Fila 4: Fecha
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Fecha de Procesamiento", bold: true, color: "334155", font: "Calibri" })] })]
          }),
          new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: currentDate, font: "Calibri" })] })]
          })
        ]
      })
    ]
  });

  // Estructura de párrafos para el documento
  const documentChildren = [
    // Título Principal
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
      children: [
        new TextRun({
          text: "REPORTE DE TRANSCRIPCIÓN IA",
          bold: true,
          size: 32, // 16pt
          color: "4F46E5", // Indigo Accent
          font: "Calibri",
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: "Generado por BridgeVox 2.0",
          italic: true,
          size: 20, // 10pt
          color: "64748B",
          font: "Calibri",
        })
      ]
    }),
    
    // Tabla de Metadatos
    metaTable,
    new Paragraph({ spacing: { before: 400, after: 200 } }), // Espacio divisor
    
    // Encabezado Transcripción
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 150 },
      children: [
        new TextRun({
          text: `Transcripción Original (${sourceLangName})`,
          bold: true,
          size: 24, // 12pt
          color: "0F172A",
          font: "Calibri",
        })
      ]
    }),
  ];

  // Agregar párrafos de texto de transcripción (manejando saltos de línea)
  const transcriptParagraphs = transcript.split('\n').filter(p => p.trim());
  if (transcriptParagraphs.length === 0) {
    documentChildren.push(new Paragraph({
      children: [new TextRun({ text: "No se encontró texto en la transcripción.", italic: true, font: "Calibri" })]
    }));
  } else {
    for (const textParagraph of transcriptParagraphs) {
      documentChildren.push(new Paragraph({
        spacing: { after: 120 }, // Margen inferior del párrafo
        lineSpacing: { before: 100, after: 100, line: 360 }, // 1.5 espacio de línea
        children: [
          new TextRun({
            text: textParagraph,
            size: 22, // 11pt
            color: "334155",
            font: "Calibri",
          })
        ]
      }));
    }
  }

  // Si hay traducción, agregarla también al reporte de Word
  if (translation && translation.trim()) {
    documentChildren.push(
      new Paragraph({ spacing: { before: 400, after: 200 } }), // Espaciador
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 150 },
        children: [
          new TextRun({
            text: `Traducción al ${targetLangName}`,
            bold: true,
            size: 24, // 12pt
            color: "0F172A",
            font: "Calibri",
          })
        ]
      })
    );

    const translationParagraphs = translation.split('\n').filter(p => p.trim());
    for (const textParagraph of translationParagraphs) {
      documentChildren.push(new Paragraph({
        spacing: { after: 120 },
        lineSpacing: { before: 100, after: 100, line: 360 },
        children: [
          new TextRun({
            text: textParagraph,
            size: 22, // 11pt
            color: "334155",
            font: "Calibri",
          })
        ]
      }));
    }
  }

  // Instanciar el documento final
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,    // 1 pulgada (1440 dxa)
            right: 1440,
            bottom: 1440,
            left: 1440
          }
        }
      },
      children: documentChildren,
    }],
  });

  // Generar y empaquetar el buffer binario
  return Packer.toBuffer(doc);
}

module.exports = {
  generateDocxBuffer
};
