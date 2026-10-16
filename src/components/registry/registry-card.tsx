'use client';

import { useState } from 'react';

export interface RegistryItem {
  id: string;
  title: string;
  description: string;
  // Add other fields as needed
}

export default function RegistryCard({ item }: { item: RegistryItem }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`border rounded-lg p-4 hover:shadow-lg transition-shadow duration-200 ${
        isHovered ? 'hover:bg-gray-50' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
      {/* Add more fields or actions as needed */}
    </div>
  );
}