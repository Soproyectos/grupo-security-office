interface CategoryTileProps {
  name: string
  iconBg: string
  iconColor: string
  count: string
}

export default function CategoryTile({
  name,
  iconBg,
  iconColor,
  count,
}: CategoryTileProps) {
  return (
    <div className="bg-white rounded-[16px] p-[22px_26px] flex items-center gap-4">
      <div
        className="flex items-center justify-center flex-shrink-0 rounded-[14px]"
        style={{
          width: '54px',
          height: '54px',
          backgroundColor: iconBg,
          color: iconColor,
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </div>
      <div>
        <h3 className="m-0 font-black text-[15.5px] text-[#1A1A1A]">{name}</h3>
        <a href="#" className="text-[12.5px] font-semibold hover:opacity-80">
          Ver {count} productos →
        </a>
      </div>
    </div>
  )
}
