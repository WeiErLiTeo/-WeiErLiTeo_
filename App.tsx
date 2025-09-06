/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, ChangeEvent, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateStyledImage } from './services/geminiService';
import PolaroidCard from './components/PolaroidCard';
import RemixModal from './components/RemixModal';
import { createAlbumPage } from './lib/albumUtils';
import Footer from './components/Footer';

const SCENES = [
    'As an Auto Memory Doll', 
    'In a Leiden Street Scene', 
    'At a Grand Ball', 
    'In a Countryside Landscape', 
    'Writing a Letter', 
    'Under a Starry Sky'
];


// Pre-defined positions for a scattered look on desktop
const POSITIONS = [
    { top: '5%', left: '10%', rotate: -8 },
    { top: '15%', left: '60%', rotate: 5 },
    { top: '45%', left: '5%', rotate: 3 },
    { top: '2%', left: '35%', rotate: 10 },
    { top: '40%', left: '70%', rotate: -12 },
    { top: '50%', left: '38%', rotate: -3 },
];

const GHOST_POLAROIDS_CONFIG = [
  { initial: { x: "-150%", y: "-100%", rotate: -30 }, transition: { delay: 0.2 } },
  { initial: { x: "150%", y: "-80%", rotate: 25 }, transition: { delay: 0.4 } },
  { initial: { x: "-120%", y: "120%", rotate: 45 }, transition: { delay: 0.6 } },
  { initial: { x: "180%", y: "90%", rotate: -20 }, transition: { delay: 0.8 } },
  { initial: { x: "0%", y: "-200%", rotate: 0 }, transition: { delay: 0.5 } },
  { initial: { x: "100%", y: "150%", rotate: 10 }, transition: { delay: 0.3 } },
];


type ImageStatus = 'pending' | 'done' | 'error';
interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

const primaryButtonClasses = "font-lato text-xl text-center text-amber-900 bg-amber-400 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:-rotate-2 hover:bg-amber-300 shadow-[2px_2px_0px_2px_rgba(0,0,0,0.1)]";
const secondaryButtonClasses = "font-lato text-xl text-center text-white bg-white/10 backdrop-blur-sm border-2 border-white/80 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:rotate-2 hover:bg-white hover:text-amber-800";

const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }
        const listener = () => setMatches(media.matches);
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    }, [matches, query]);
    return matches;
};

function App() {
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [appState, setAppState] = useState<'idle' | 'image-uploaded' | 'generating' | 'results-shown'>('idle');
    const dragAreaRef = useRef<HTMLDivElement>(null);
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [remixModalState, setRemixModalState] = useState<{
        isOpen: boolean;
        scene: string | null;
        imageUrl: string | null;
    }>({ isOpen: false, scene: null, imageUrl: null });


    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setUploadedImage(reader.result as string);
                setAppState('image-uploaded');
                setGeneratedImages({}); // Clear previous results
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerateClick = async () => {
        if (!uploadedImage) return;

        setIsLoading(true);
        setAppState('generating');
        
        const initialImages: Record<string, GeneratedImage> = {};
        SCENES.forEach(scene => {
            initialImages[scene] = { status: 'pending' };
        });
        setGeneratedImages(initialImages);

        const concurrencyLimit = 2; // Process two scenes at a time
        const scenesQueue = [...SCENES];

        const processScene = async (scene: string) => {
            try {
                const prompt = `Reimagine the person in this photo in the artistic style of the anime 'Violet Evergarden'. The scene is: "${scene}". Capture the painterly, emotional aesthetic of the anime with detailed clothing and background appropriate for the scene. The output must be a high-quality, artistic image.`;
                const resultUrl = await generateStyledImage(uploadedImage, prompt, scene);
                setGeneratedImages(prev => ({
                    ...prev,
                    [scene]: { status: 'done', url: resultUrl },
                }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
                setGeneratedImages(prev => ({
                    ...prev,
                    [scene]: { status: 'error', error: errorMessage },
                }));
                console.error(`Failed to generate image for ${scene}:`, err);
            }
        };

        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (scenesQueue.length > 0) {
                const scene = scenesQueue.shift();
                if (scene) {
                    await processScene(scene);
                }
            }
        });

        await Promise.all(workers);

        setIsLoading(false);
        setAppState('results-shown');
    };

    const handleRegenerateScene = async (scene: string) => {
        if (!uploadedImage) return;

        // Prevent re-triggering if a generation is already in progress
        if (generatedImages[scene]?.status === 'pending') {
            return;
        }
        
        console.log(`Regenerating image for ${scene}...`);

        // Set the specific scene to 'pending' to show the loading spinner
        setGeneratedImages(prev => ({
            ...prev,
            [scene]: { status: 'pending' },
        }));

        // Call the generation service for the specific scene
        try {
            const prompt = `Reimagine the person in this photo in the artistic style of the anime 'Violet Evergarden'. The scene is: "${scene}". Capture the painterly, emotional aesthetic of the anime with detailed clothing and background appropriate for the scene. The output must be a high-quality, artistic image.`;
            const resultUrl = await generateStyledImage(uploadedImage, prompt, scene);
            setGeneratedImages(prev => ({
                ...prev,
                [scene]: { status: 'done', url: resultUrl },
            }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setGeneratedImages(prev => ({
                ...prev,
                [scene]: { status: 'error', error: errorMessage },
            }));
            console.error(`Failed to regenerate image for ${scene}:`, err);
        }
    };
    
    const handleReset = () => {
        setUploadedImage(null);
        setGeneratedImages({});
        setAppState('idle');
    };

    const handleDownloadIndividualImage = (scene: string) => {
        const image = generatedImages[scene];
        if (image?.status === 'done' && image.url) {
            const link = document.createElement('a');
            link.href = image.url;
            link.download = `violet-evergarden-${scene.toLowerCase().replace(/\s/g, '-')}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleDownloadAlbum = async () => {
        setIsDownloading(true);
        try {
            const imageData = Object.entries(generatedImages)
                .filter(([, image]) => image.status === 'done' && image.url)
                .reduce((acc, [scene, image]) => {
                    acc[scene] = image!.url!;
                    return acc;
                }, {} as Record<string, string>);

            if (Object.keys(imageData).length < SCENES.length) {
                alert("Please wait for all images to finish generating before downloading the album.");
                return;
            }

            const albumDataUrl = await createAlbumPage(imageData);

            const link = document.createElement('a');
            link.href = albumDataUrl;
            link.download = 'violet-evergarden-album.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Failed to create or download album:", error);
            alert("Sorry, there was an error creating your album. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };
    
    const handleOpenRemixModal = (scene: string, imageUrl: string) => {
        setRemixModalState({ isOpen: true, scene, imageUrl });
    };

    const handleCloseRemixModal = () => {
        setRemixModalState({ isOpen: false, scene: null, imageUrl: null });
    };

    const handleSaveRemixedImage = (scene: string, newImageUrl: string) => {
        setGeneratedImages(prev => ({
            ...prev,
            [scene]: { ...prev[scene], status: 'done', url: newImageUrl },
        }));
        handleCloseRemixModal();
    };

    return (
        <main className="text-neutral-800 min-h-screen w-full flex flex-col items-center justify-center p-4 pb-24 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-full bg-grid-black/[0.05]"></div>
            
            <div className="z-10 flex flex-col items-center justify-center w-full h-full flex-1 min-h-0">
                <div className="text-center mb-10">
                    <h1 className="text-7xl md:text-9xl font-great-vibes text-neutral-900">Violet Evergarden</h1>
                    <p className="text-neutral-700 mt-2 text-xl tracking-wide">See yourself in the style of an Auto Memory Doll.</p>
                </div>

                {appState === 'idle' && (
                     <div className="relative flex flex-col items-center justify-center w-full">
                        {/* Ghost polaroids for intro animation */}
                        {GHOST_POLAROIDS_CONFIG.map((config, index) => (
                             <motion.div
                                key={index}
                                className="absolute w-80 h-[26rem] rounded-md p-4 bg-neutral-100/10 blur-sm"
                                initial={config.initial}
                                animate={{
                                    x: "0%", y: "0%", rotate: (Math.random() - 0.5) * 20,
                                    scale: 0,
                                    opacity: 0,
                                }}
                                transition={{
                                    ...config.transition,
                                    ease: "circOut",
                                    duration: 2,
                                }}
                            />
                        ))}
                        <motion.div
                             initial={{ opacity: 0, scale: 0.8 }}
                             animate={{ opacity: 1, scale: 1 }}
                             transition={{ delay: 2, duration: 0.8, type: 'spring' }}
                             className="flex flex-col items-center"
                        >
                            <label htmlFor="file-upload" className="cursor-pointer group transform hover:scale-105 transition-transform duration-300">
                                 <PolaroidCard 
                                     caption="Click to begin"
                                     status="done"
                                 />
                            </label>
                            <input id="file-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} />
                            <p className="mt-8 text-neutral-600 text-center max-w-xs text-lg">
                                Click the polaroid to upload your photo and start your journey.
                            </p>
                        </motion.div>
                    </div>
                )}

                {appState === 'image-uploaded' && uploadedImage && (
                    <div className="flex flex-col items-center gap-6">
                         <PolaroidCard 
                            imageUrl={uploadedImage} 
                            caption="Your Photo" 
                            status="done"
                         />
                         <div className="flex items-center gap-4 mt-4">
                            <button onClick={handleReset} className={secondaryButtonClasses}>
                                Different Photo
                            </button>
                            <button onClick={handleGenerateClick} className={primaryButtonClasses}>
                                Generate
                            </button>
                         </div>
                    </div>
                )}

                {(appState === 'generating' || appState === 'results-shown') && (
                     <>
                        {isMobile ? (
                            <div className="w-full max-w-sm flex-1 overflow-y-auto mt-4 space-y-8 p-4">
                                {SCENES.map((scene) => (
                                    <div key={scene} className="flex justify-center">
                                         <PolaroidCard
                                            caption={scene}
                                            status={generatedImages[scene]?.status || 'pending'}
                                            imageUrl={generatedImages[scene]?.url}
                                            error={generatedImages[scene]?.error}
                                            onShake={handleRegenerateScene}
                                            onDownload={handleDownloadIndividualImage}
                                            onRemix={handleOpenRemixModal}
                                            isMobile={isMobile}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div ref={dragAreaRef} className="relative w-full max-w-5xl h-[600px] mt-4">
                                {SCENES.map((scene, index) => {
                                    const { top, left, rotate } = POSITIONS[index];
                                    return (
                                        <motion.div
                                            key={scene}
                                            className="absolute cursor-grab active:cursor-grabbing"
                                            style={{ top, left }}
                                            initial={{ opacity: 0, scale: 0.5, y: 100, rotate: 0 }}
                                            animate={{ 
                                                opacity: 1, 
                                                scale: 1, 
                                                y: 0,
                                                rotate: `${rotate}deg`,
                                            }}
                                            transition={{ type: 'spring', stiffness: 100, damping: 20, delay: index * 0.15 }}
                                        >
                                            <PolaroidCard 
                                                dragConstraintsRef={dragAreaRef}
                                                caption={scene}
                                                status={generatedImages[scene]?.status || 'pending'}
                                                imageUrl={generatedImages[scene]?.url}
                                                error={generatedImages[scene]?.error}
                                                onShake={handleRegenerateScene}
                                                onDownload={handleDownloadIndividualImage}
                                                onRemix={handleOpenRemixModal}
                                                isMobile={isMobile}
                                            />
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                         <div className="h-20 mt-4 flex items-center justify-center">
                            {appState === 'results-shown' && (
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <button 
                                        onClick={handleDownloadAlbum} 
                                        disabled={isDownloading} 
                                        className={`${primaryButtonClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {isDownloading ? 'Creating Album...' : 'Download Album'}
                                    </button>
                                    <button onClick={handleReset} className={secondaryButtonClasses}>
                                        Start Over
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            <Footer />
            <RemixModal
                isOpen={remixModalState.isOpen}
                onClose={handleCloseRemixModal}
                onSave={handleSaveRemixedImage}
                scene={remixModalState.scene}
                initialImageUrl={remixModalState.imageUrl}
            />
        </main>
    );
}

export default App;