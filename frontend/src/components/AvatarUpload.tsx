import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { supabase } from '../lib/supabase'
import Spinner from './Spinner'

interface AvatarUploadProps {
  currentAvatarUrl?: string | null
  onAvatarChange: (url: string | null) => void
  participantId?: string // If editing existing participant
  tripId: string
}

// Helper to create cropped image
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image()
  image.src = imageSrc
  await new Promise((resolve) => (image.onload = resolve))

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  // Set canvas size to desired output (256x256 for avatars)
  const size = 256
  canvas.width = size
  canvas.height = size

  // Draw cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size
  )

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.9)
  })
}

export default function AvatarUpload({
  currentAvatarUrl,
  onAvatarChange,
  participantId,
  tripId,
}: AvatarUploadProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.size > 10 * 1024 * 1024) {
        setError('Image must be less than 10MB')
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        setImageSrc(reader.result as string)
        setError(null)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return

    setUploading(true)
    setError(null)

    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
      const fileName = `${tripId}/${participantId || Date.now()}.jpg`

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, croppedBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)

      onAvatarChange(urlData.publicUrl)
      setImageSrc(null)
    } catch (err) {
      console.error('Upload error:', err)
      setError('Failed to upload image. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleCancel = () => {
    setImageSrc(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setError(null)
  }

  const handleRemove = () => {
    onAvatarChange(null)
  }

  // Show crop interface if an image is selected
  if (imageSrc) {
    return (
      <div className="space-y-4">
        <div className="relative w-full h-64 bg-gray-900 rounded-lg overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Zoom:</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={uploading}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading && <Spinner size="sm" />}
            {uploading ? 'Uploading...' : 'Save Photo'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={uploading}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Show current avatar or upload button
  return (
    <div className="flex items-center gap-4">
      {currentAvatarUrl ? (
        <img
          src={currentAvatarUrl}
          alt="Avatar"
          className="w-16 h-16 rounded-full object-cover"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-medium">
          {currentAvatarUrl ? 'Change Photo' : 'Add Photo'}
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
        {currentAvatarUrl && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-sm text-red-600 hover:text-red-800 text-left"
          >
            Remove
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
