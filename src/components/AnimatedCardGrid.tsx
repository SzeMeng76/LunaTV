'use client';

import { motion } from 'framer-motion';
import React from 'react';

interface AnimatedCardGridProps {
  children: React.ReactNode;
  className?: string;
}

// 容器动画配置
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08, // 每个子元素延迟 80ms
      delayChildren: 0.1,    // 首个子元素延迟 100ms
    },
  },
};

// 子元素动画配置
const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 100,
      damping: 15,
      mass: 0.5,
    },
  },
};

export default function AnimatedCardGrid({
  children,
  className = '',
}: AnimatedCardGridProps) {
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {React.Children.map(children, (child, index) => (
        <motion.div
          key={index}
          variants={itemVariants}
          className="inline-block"
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
