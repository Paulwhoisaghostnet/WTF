"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import UnifiedGallery from "@/components/UnifiedGallery";
import { WTF_PROFILE_GALLERY_ID } from "@/lib/wtf/profile-tokens";

export default function WtfProfileGalleryPageNumber() {
    const params = useParams();
    const router = useRouter();
    const pageNumber = parseInt(params.pagenum as string, 10);

    useEffect(() => {
        if (pageNumber === 1) {
            router.replace("/wtf");
        }
    }, [pageNumber, router]);

    if (Number.isNaN(pageNumber) || pageNumber < 1) {
        return <div className="p-8 text-white">Invalid page number</div>;
    }

    return (
        <UnifiedGallery
            address={WTF_PROFILE_GALLERY_ID}
            currentPage={pageNumber}
            isBasePage={false}
            enableDocumentTitle={true}
        />
    );
}
