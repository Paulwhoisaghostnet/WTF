"use client";

import { createContext, useContext, useState, useEffect } from "react";

type CameraMode = "walk" | "overview";

interface ViewStateContextType {
    cameraMode: CameraMode;
    setCameraMode: (mode: CameraMode) => void;
    animationsEnabled: boolean;
    setAnimationsEnabled: (enabled: boolean) => void;
}

const ViewStateContext = createContext<ViewStateContextType | undefined>(undefined);

export function ViewStateProvider({ children }: { children: React.ReactNode }) {
    const [cameraMode, setCameraMode] = useState<CameraMode>("walk");
    const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(false); // Default to still

    // Persist animation preference to localStorage
    useEffect(() => {
        try {
            const saved = window.localStorage?.getItem("collekt-animations-enabled");
            if (saved !== null && saved !== undefined) {
                setAnimationsEnabled(JSON.parse(saved));
            } else {
                // Set default to false for new users
                setAnimationsEnabled(false);
            }
        } catch {
            setAnimationsEnabled(false);
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage?.setItem("collekt-animations-enabled", JSON.stringify(animationsEnabled));
        } catch {
            // Storage can be unavailable in privacy modes or SSR-like test runtimes.
        }
    }, [animationsEnabled]);

    return (
        <ViewStateContext.Provider
            value={{
                cameraMode,
                setCameraMode,
                animationsEnabled,
                setAnimationsEnabled,
            }}
        >
            {children}
        </ViewStateContext.Provider>
    );
}

export function useViewState() {
    const context = useContext(ViewStateContext);
    if (context === undefined) {
        throw new Error("useViewState must be used within a ViewStateProvider");
    }
    return context;
}
