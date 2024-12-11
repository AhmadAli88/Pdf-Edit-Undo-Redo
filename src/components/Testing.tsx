














/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useCallback, useEffect, useRef, useState } from 'react';

//pdf livbraries use
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { Undo2, Redo2 } from 'lucide-react';
//icons used
import { Highlighter, Pen, Type, Moon, Sun } from 'lucide-react';

//worker source configuration that loads the pdf files
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Define all types for annotations
type Point = { x: number; y: number };

type HighlightAnnotation = {
  type: 'highlight';
  page: number;
  start: Point;
  end: Point;
  color: string;
};

type DrawingAnnotation = {
  type: 'draw';
  page: number;
  points: Point[];
  color: string;
  width: number;
};

type TextAnnotation = {
  type: 'text';
  page: number;
  position: Point;
  text: string;
  color: string;
};

type Annotation = HighlightAnnotation | DrawingAnnotation | TextAnnotation;

//all interfaces

interface PDFViewerProps {
  pdfUrl?: string;
}

interface TextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

interface TextContent {
  items: TextItem[];
  styles: Record<string, unknown>;
}
const PDFViewer: React.FC<PDFViewerProps> = ({
  pdfUrl = 'https://almsbe.xeventechnologies.com/api/s3/file/multiple_quizzes-(2).pdf',
}) => {
  const [annotationHistory, setAnnotationHistory] = useState<{
    past: Annotation[][];
    present: Annotation[];
    future: Annotation[][];
  }>({
    past: [],
    present: [],
    future: [],
  });
  // Refs and State Management
  const [undoStack, setUndoStack] = useState<Annotation[][]>([[]]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [currentAnnotations, setCurrentAnnotations] = useState<Annotation[]>(
    []
  );
  const [replaceText, setReplaceText] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const pageRef = useRef<any>(null);
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff');
  // Signature-related states
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<
    { pageNum: number; matches: DOMRect[] }[]
  >([]);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [signatureSize, setSignatureSize] = useState<{
    width: number;
    height: number;
  }>({ width: 150, height: 50 });

  // Modify the
  // New state for theme and signature
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(false);
  // PDF-related states
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.5);
  // Undo/Redo State Management
  const [annotationStack, setAnnotationStack] = useState<Annotation[][]>([[]]);
  const [currentStackIndex, setCurrentStackIndex] = useState(0);
  // Annotation-related states
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  // Modify the current tool to include signature
  const [currentTool, setCurrentTool] = useState<
    'select' | 'draw' | 'highlight' | 'text'
  >('highlight');
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [highlightInfo, setHighlightInfo] = useState<{
    start: Point;
    current: Point;
  } | null>(null);

  // Error and UI states
  const [error, setError] = useState<string | null>(null);
  const [annotationColor, setAnnotationColor] = useState<string>('#FFFF00');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalText, setModalText] = useState<string>('');
  const [modalPosition, setModalPosition] = useState<Point | null>(null);

  // PDF Loading Effect
  useEffect(() => {
    const loadPDF = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        renderPage(1, pdf);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF. Please check the file path.');
      }
    };
    loadPDF();
  }, [pdfUrl]);

  // Add these functions to handle undo/redo operations
  const handleUndo = useCallback(() => {
    setAnnotationHistory((currentHistory) => {
      const { past, present, future } = currentHistory;

      if (past.length === 0) return currentHistory;

      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);

      return {
        past: newPast,
        present: previous,
        future: [present, ...future],
      };
    });
  }, []);

  const handleRedo = useCallback(() => {
    setAnnotationHistory((currentHistory) => {
      const { past, present, future } = currentHistory;

      if (future.length === 0) return currentHistory;

      const next = future[0];
      const newFuture = future.slice(1);

      return {
        past: [...past, present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  // Modify your addAnnotation function to work with the history
  const addAnnotation = useCallback((newAnnotation: Annotation) => {
    setAnnotationHistory((currentHistory) => {
      const { past, present } = currentHistory;
      const newPresent = [...present, newAnnotation];

      return {
        past: [...past, present],
        present: newPresent,
        future: [], // Clear redo stack when new action is performed
      };
    });
  }, []);

  // Update the renderAnnotations function to use the history's present state
  const renderAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    // Clear the canvas first
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Re-render the PDF page
    if (pageRef.current) {
      const viewport = pageRef.current.getViewport({ scale });
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        background: 'transparent',
      };
      renderTaskRef.current = pageRef.current.render(renderContext);
    }

    // Render all current annotations
    annotationHistory.present.forEach((annotation) => {
      if (annotation.page === pageNum) {
        switch (annotation.type) {
          case 'highlight':
            renderHighlight(context, annotation);
            break;
          case 'draw':
            renderDrawing(context, annotation);
            break;
          case 'text':
            renderTextAnnotation(context, annotation);
            break;
        }
      }
    });
  }, [annotationHistory.present, pageNum, scale]);

  const renderPage = useCallback(
    async (
      pageNumber: number,
      pdfDocument: pdfjsLib.PDFDocumentProxy | null = pdfDoc
    ) => {
      if (!pdfDocument || !canvasRef.current) return;

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      try {
        if (pageRef.current) {
          pageRef.current.cleanup();
        }

        const page = await pdfDocument.getPage(pageNumber);
        pageRef.current = page;

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Fill background with selected color
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          background: 'transparent', // Make PDF background transparent
        };

        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;

        renderAnnotations();
      } catch (err) {
        console.error('Error rendering page:', err);
        setError('Failed to render page');
      }
    },
    [pdfDoc, scale, backgroundColor, renderAnnotations] // Add backgroundColor to dependencies
  );
  const handleSearch = useCallback(
    async (shouldReplace: boolean = false) => {
      if (!searchText || !pdfDoc) return;

      const page = await pdfDoc.getPage(pageNum);
      const textContent = (await page.getTextContent()) as TextContent;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await renderPage(pageNum);

      let matchCount = 0;
      const items = [...textContent.items];

      // Sort items by vertical position (top to bottom)
      items.sort((a, b) => b.transform[5] - a.transform[5]);

      for (const item of items) {
        const text = item.str || '';
        const regex = new RegExp(`\\b${searchText}\\b`, 'gi');
        let match;

        while ((match = regex.exec(text)) !== null) {
          matchCount++;
          const index = match.index;
          const transform = item.transform;
          const fontHeight = Math.abs(transform[3] || 12);
          const scaledFontHeight = fontHeight * viewport.scale;

          ctx.font = `${scaledFontHeight}px sans-serif`;

          // Calculate positions and dimensions
          const lineStart = transform[4] * viewport.scale;
          const lineWidth = canvas.width - lineStart - 20; // Leave some margin
          const preText = text.substring(0, index);
          const preWidth = ctx.measureText(preText).width;
          const searchWidth = ctx.measureText(searchText).width;

          if (shouldReplace) {
            // Clear the area of original text
            ctx.fillStyle = 'white';
            ctx.fillRect(
              lineStart + preWidth,
              canvas.height -
                transform[5] * viewport.scale -
                scaledFontHeight -
                5,
              searchWidth,
              scaledFontHeight + 10
            );

            // Handle text wrapping for replacement text
            const words = replaceText.split(' ');
            let currentLine = '';
            let currentX = lineStart + preWidth;
            let currentY = canvas.height - transform[5] * viewport.scale;
            let maxY = currentY;

            // Clear a larger area for potential wrapped text
            ctx.fillStyle = 'white';
            const potentialHeight =
              scaledFontHeight * Math.ceil(replaceText.length / 30); // Estimate
            ctx.fillRect(
              currentX - 2,
              currentY - scaledFontHeight - 5,
              lineWidth + 4,
              potentialHeight + 10
            );

            ctx.fillStyle = 'black';

            // Draw text with wrapping
            for (const word of words) {
              const testLine = currentLine + (currentLine ? ' ' : '') + word;
              const metrics = ctx.measureText(testLine);

              if (currentX + metrics.width > lineStart + lineWidth) {
                // Draw current line and move to next
                ctx.fillText(
                  currentLine,
                  currentX,
                  currentY - scaledFontHeight * 0.2
                );
                currentLine = word;
                currentX = lineStart + preWidth;
                currentY += scaledFontHeight * 1.2;
                maxY = Math.max(maxY, currentY);
              } else {
                currentLine = testLine;
              }
            }

            // Draw remaining text
            if (currentLine) {
              ctx.fillText(
                currentLine,
                currentX,
                currentY - scaledFontHeight * 0.2
              );
            }

            // Handle remaining text after replacement
            const remainingText = text.substring(index + searchText.length);
            if (remainingText) {
              const nextX = currentX + ctx.measureText(currentLine).width + 5;
              ctx.fillText(
                remainingText,
                nextX,
                currentY - scaledFontHeight * 0.2
              );
            }
          } else {
            // Highlight for search
            ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
            ctx.fillRect(
              lineStart + preWidth,
              canvas.height - transform[5] * viewport.scale - scaledFontHeight,
              searchWidth,
              scaledFontHeight
            );
          }
        }
      }

      renderAnnotations();
      setSearchResults(new Array(matchCount).fill(null));
    },
    [
      searchText,
      replaceText,
      pdfDoc,
      pageNum,
      scale,
      renderPage,
      renderAnnotations,
    ]
  );

  // Add this new function to handle replace
  const handleReplace = useCallback(() => {
    if (!searchText || !replaceText) return;
    handleSearch(true);
  }, [searchText, replaceText, handleSearch]);

  // Add an effect to re-render annotations when they change
  useEffect(() => {
    if (annotations.length >= 0) {
      renderAnnotations();
    }
  }, [annotations, renderAnnotations]);

  const renderHighlight = (
    context: CanvasRenderingContext2D,
    annotation: HighlightAnnotation
  ) => {
    const { start, end, color } = annotation;
    context.fillStyle = color;
    context.fillRect(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.abs(end.x - start.x),
      Math.abs(end.y - start.y)
    );
  };

  const renderDrawing = (
    context: CanvasRenderingContext2D,
    annotation: DrawingAnnotation
  ) => {
    context.beginPath();
    context.strokeStyle = annotation.color;
    context.lineWidth = annotation.width;
    annotation.points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
  };

  const renderTextAnnotation = (
    context: CanvasRenderingContext2D,
    annotation: TextAnnotation
  ) => {
    context.font = '16px Arial';
    context.fillStyle = annotation.color;
    context.fillText(
      annotation.text,
      annotation.position.x,
      annotation.position.y
    );
  };

  const renderCurrentDrawing = (context: CanvasRenderingContext2D) => {
    context.beginPath();
    context.strokeStyle = annotationColor;
    context.lineWidth = 2;
    currentPath.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
  };

  const renderCurrentHighlight = (context: CanvasRenderingContext2D) => {
    if (!highlightInfo) return;
    const { start, current } = highlightInfo;
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = annotationColor;
    context.globalAlpha = 0.3;
    context.fillRect(
      Math.min(start.x, current.x),
      Math.min(start.y, current.y),
      Math.abs(current.x - start.x),
      Math.abs(current.y - start.y)
    );
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
  };

  // Modify handleMouseDown to handle signature placement
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      switch (currentTool) {
        case 'draw':
          setIsDrawing(true);
          setCurrentPath([{ x, y }]);
          break;
        case 'highlight':
          setHighlightInfo({ start: { x, y }, current: { x, y } });
          break;
        case 'text':
          handleTextAnnotation(x, y);
          break;
      }
    },
    [currentTool, signatureImage, pageNum, addAnnotation, signatureSize]
  );
  // Modified handleMouseMove to update current path without creating stack entries
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || (currentTool !== 'highlight' && currentTool !== 'draw')) return;
  
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
  
    if (currentTool === 'draw' && isDrawing) {
      setCurrentPath(prev => [...prev, { x, y }]);
      
      // Draw the current path immediately
      const context = canvas.getContext('2d');
      if (context) {
        context.beginPath();
        context.strokeStyle = annotationColor;
        context.lineWidth = 2;
        context.moveTo(currentPath[currentPath.length - 1].x, currentPath[currentPath.length - 1].y);
        context.lineTo(x, y);
        context.stroke();
      }
    }
  
    if (currentTool === 'highlight' && highlightInfo) {
      setHighlightInfo(prev => prev ? { ...prev, current: { x, y } } : null);
      renderAnnotations();
    }
  }, [currentTool, isDrawing, currentPath, highlightInfo, annotationColor, renderAnnotations]);

  // Modified handleMouseUp to create a single stack entry for the complete drawing
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
  
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
  
    if (currentTool === 'draw' && isDrawing && currentPath.length > 0) {
      const finalPath = [...currentPath, { x, y }];
      const newAnnotation: DrawingAnnotation = {
        type: 'draw',
        page: pageNum,
        points: finalPath,
        color: annotationColor,
        width: 2,
      };
  
      setAnnotationHistory(currentHistory => ({
        past: [...currentHistory.past, currentHistory.present],
        present: [...currentHistory.present, newAnnotation],
        future: []
      }));
  
      setIsDrawing(false);
      setCurrentPath([]);
    }
  
    if (currentTool === 'highlight' && highlightInfo) {
      const newAnnotation: HighlightAnnotation = {
        type: 'highlight',
        page: pageNum,
        start: highlightInfo.start,
        end: { x, y },
        color: annotationColor,
      };
      addAnnotation(newAnnotation);
      setHighlightInfo(null);
    }
  
    renderAnnotations();
  }, [currentTool, isDrawing, pageNum, currentPath, highlightInfo, annotationColor, addAnnotation, renderAnnotations]);

  const handleTextAnnotation = (x: number, y: number) => {
    // Store the position and open the modal
    setModalPosition({ x, y });
    setModalText(''); // Clear previous text
    setIsModalOpen(true);
  };

  // Update clearAllAnnotations to work with history
  const clearAllAnnotations = useCallback(() => {
    setAnnotationHistory((currentHistory) => ({
      past: [...currentHistory.past, currentHistory.present],
      present: [],
      future: [],
    }));

    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (pageRef.current) {
          const viewport = pageRef.current.getViewport({ scale });
          const renderContext = {
            canvasContext: context,
            viewport: viewport,
            background: 'transparent',
          };
          renderTaskRef.current = pageRef.current.render(renderContext);
        }
      }
    }
  }, [backgroundColor, scale]);

  const hexToRgb = (hex: any) => {
    // Remove the # if present
    hex = hex.replace('#', '');

    // Parse the hex values directly to RGB values between 0 and 1
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    return { r, g, b };
  };
  // Modified handleModalSubmit to work with the new history system
  const handleModalSubmit = useCallback(() => {
    if (modalText && modalPosition) {
      const newAnnotation: TextAnnotation = {
        type: 'text',
        page: pageNum,
        position: modalPosition,
        text: modalText,
        color: annotationColor,
      };
      addAnnotation(newAnnotation);
      setIsModalOpen(false);
      setModalText('');
      setModalPosition(null);
    }
  }, [modalText, modalPosition, pageNum, annotationColor, addAnnotation]);

  // Function to handle modal cancellation
  const handleModalCancel = () => {
    setIsModalOpen(false);
  };
  // Modify downloadAnnotatedPDF to handle signature
  const downloadAnnotatedPDF = async () => {
    try {
      const existingPdfBytes = await fetch(pdfUrl).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      
      // Get the current page
      const page = pdfDoc.getPage(pageNum - 1);
      const pageHeight = page.getHeight();
      const pageWidth = page.getWidth();
      const canvas = canvasRef.current;
      
      if (!canvas) return;
      
      const canvasHeight = canvas.height;
      const canvasWidth = canvas.width;
  
      // Calculate scaling factors
      const scaleX = pageWidth / canvasWidth;
      const scaleY = pageHeight / canvasHeight;
  
      // Transform canvas coordinates to PDF coordinates
      const transformCoordinate = (x: number, y: number) => ({
        x: x * scaleX,
        y: pageHeight - y * scaleY,
      });
  
      // Use annotationHistory.present instead of annotations
      for (const annotation of annotationHistory.present.filter(a => a.page === pageNum)) {
        switch (annotation.type) {
          case 'highlight': {
            const color = hexToRgb(annotation.color);
            const start = transformCoordinate(annotation.start.x, annotation.start.y);
            const end = transformCoordinate(annotation.end.x, annotation.end.y);
  
            page.drawRectangle({
              x: Math.min(start.x, end.x),
              y: Math.min(start.y, end.y),
              width: Math.abs(end.x - start.x),
              height: Math.abs(end.y - start.y),
              color: rgb(color.r, color.g, color.b),
              opacity: 0.35,
            });
            break;
          }
          case 'draw': {
            const color = hexToRgb(annotation.color);
            const scaledPoints = annotation.points.map(point => 
              transformCoordinate(point.x, point.y)
            );
  
            for (let i = 1; i < scaledPoints.length; i++) {
              const prev = scaledPoints[i - 1];
              const curr = scaledPoints[i];
              page.drawLine({
                start: prev,
                end: curr,
                thickness: annotation.width * scaleX, // Scale the line thickness
                color: rgb(color.r, color.g, color.b),
              });
            }
            break;
          }
          case 'text': {
            const color = hexToRgb(annotation.color);
            const transformedPos = transformCoordinate(
              annotation.position.x,
              annotation.position.y
            );
  
            page.drawText(annotation.text, {
              x: transformedPos.x,
              y: transformedPos.y,
              size: 16 * scaleX, // Scale the text size
              color: rgb(color.r, color.g, color.b),
            });
            break;
          }
        }
      }
  
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = 'annotated-document.pdf';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (error) {
      console.error('Error downloading annotated PDF:', error);
    }
  };
  // Cleanup effect
  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      if (pageRef.current) {
        pageRef.current.cleanup();
      }
    };
  }, []);

  // Add an effect to update the canvas when history changes
  useEffect(() => {
    renderAnnotations();
  }, [annotationHistory.present, renderAnnotations]);
  return (
    <div
      className={`w-full mx-auto p-4 transition-colors duration-300 ${
        isDarkTheme ? 'bg-gray-900 text-white' : 'bg-white text-black'
      }`}
    >
      <div className='absolute top-4 right-4'>
        <button
          onClick={() => setIsDarkTheme(!isDarkTheme)}
          className={`p-2 rounded-full ${
            isDarkTheme
              ? 'bg-gray-700 text-yellow-400'
              : 'bg-gray-200 text-gray-800'
          }`}
        >
          {isDarkTheme ? <Sun size={24} /> : <Moon size={24} />}
        </button>
      </div>

      {/* Modal Open due to thid code */}
      {isModalOpen && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50'>
          <div className='bg-white rounded-lg p-6 shadow-lg w-96'>
            <h2 className='text-lg font-semibold mb-4'>Add Text Annotation</h2>
            <textarea
              className='w-full border border-gray-300 rounded-lg p-2 h-20'
              value={modalText}
              onChange={(e) => setModalText(e.target.value)}
              placeholder='Enter annotation text here...'
            />
            <div className='flex justify-end mt-4 gap-2'>
              <button
                className='px-4 py-2 bg-gray-300 text-black rounded hover:bg-gray-400'
                onClick={handleModalCancel}
              >
                Cancel
              </button>
              <button
                className='px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600'
                onClick={handleModalSubmit}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className='bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4'>
          {error}
        </div>
      )}

      {/* Flexbox Container */}
      <div
        className={`flex gap-4 custom-height overflow-hidden ${
          isDarkTheme
            ? 'bg-gray-800 border-gray-700'
            : 'bg-white border-gray-300'
        }`}
      >
        {/* PDF Viewer */}
        <div
          className={`flex-grow relative border rounded custom-boxShadow ${
            isDarkTheme
              ? 'border-gray-700 bg-gray-800'
              : 'border-gray-300 bg-white'
          }`}
        >
          {/* canvas  contrrolled here */}
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`cursor-${
              currentTool === 'highlight' || currentTool === 'draw'
                ? 'crosshair'
                : currentTool === 'text'
                ? 'text'
                : 'default'
            }`}
          />
        </div>

        {/* Toolbar */}
        <div
          className={`flex-shrink-0 p-4 border rounded custom-boxShadow ${
            isDarkTheme
              ? 'bg-gray-700 border-gray-600 text-white'
              : 'bg-gray-100 border-gray-300'
          }`}
        >
          {/* Add Text Annotation Button */}
          <h3 className='text-lg font-bold mb-4'>Tools</h3>
          {/* Tool Selection Buttons */}
          <div className='mb-4 flex flex-col gap-2'>
            <button
              key='highlight'
              className={`px-3 py-2 rounded flex items-center gap-2 ${
                currentTool === 'highlight' ? 'bg-green-700' : 'bg-green-500'
              } text-white hover:bg-green-600`}
              onClick={() => setCurrentTool('highlight')}
              title='Highlight'
            >
              <Highlighter size={18} />
              Highlight
            </button>

            <button
              key='draw'
              className={`px-3 py-2 rounded flex items-center gap-2 ${
                currentTool === 'draw' ? 'bg-purple-700' : 'bg-purple-500'
              } text-white hover:bg-purple-600`}
              onClick={() => setCurrentTool('draw')}
              title='Draw'
            >
              <Pen size={18} />
              Draw
            </button>

            <button
              key='text'
              className={`px-3 py-2 rounded flex items-center gap-2 ${
                currentTool === 'text' ? 'bg-blue-700' : 'bg-blue-500'
              } text-white hover:bg-blue-600`}
              onClick={() => setCurrentTool('text')}
              title='Text Annotation'
            >
              <Type size={18} />
              Text
            </button>

            <div className='mb-4 flex flex-col gap-2'>
              <button
                className={`px-3 py-2 rounded flex items-center gap-2 
      ${
        annotationHistory.past.length > 0
          ? 'bg-blue-500 hover:bg-blue-600'
          : 'bg-gray-400'
      } 
      text-white`}
                onClick={handleUndo}
                disabled={annotationHistory.past.length === 0}
                title='Undo'
              >
                <Undo2 size={18} />
                Undo
              </button>

              <button
                className={`px-3 py-2 rounded flex items-center gap-2 
      ${
        annotationHistory.future.length > 0
          ? 'bg-blue-500 hover:bg-blue-600'
          : 'bg-gray-400'
      } 
      text-white`}
                onClick={handleRedo}
                disabled={annotationHistory.future.length === 0}
                title='Redo'
              >
                <Redo2 size={18} />
                Redo
              </button>
            </div>
          </div>

          {/* Color Picker */}
          <div className='mb-4'>
            <label className='block text-sm font-medium mb-1'>Color:</label>
            <input
              type='color'
              value={annotationColor}
              onChange={(e) => setAnnotationColor(e.target.value)}
              className='h-10 w-full border border-gray-300 rounded'
            />
          </div>

          {/* Utility Buttons */}
          <div className='flex flex-col gap-2'>
            <button
              className='px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600'
              onClick={clearAllAnnotations}
            >
              Clear All
            </button>
            <button
              className='px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600'
              onClick={downloadAnnotatedPDF}
            >
              Download PDF
            </button>
          </div>
        </div>
      </div>

      {/* Page Navigation */}
      <div
        className={`mt-4 flex justify-center items-center gap-4 ${
          isDarkTheme ? 'text-white' : 'text-black'
        }`}
      >
        <button
          className='px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600'
          onClick={() => {
            const newPage = pageNum - 1;
            if (newPage >= 1) {
              setPageNum(newPage);
              renderPage(newPage);
            }
          }}
          disabled={pageNum <= 1}
        >
          Previous
        </button>
        <span className='py-2'>
          Page {pageNum} of {totalPages}
        </span>
        <button
          className='px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600'
          onClick={() => {
            const newPage = pageNum + 1;
            if (newPage <= totalPages) {
              setPageNum(newPage);
              renderPage(newPage);
            }
          }}
          disabled={pageNum >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default PDFViewer;
