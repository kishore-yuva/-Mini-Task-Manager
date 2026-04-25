import React, { useState } from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Send, Linkedin, ArrowLeft, Mail, Loader2 } from 'lucide-react';

interface ContactDeveloperProps {
  onBack: () => void;
  userEmail?: string;
}

export const ContactDeveloper: React.FC<ContactDeveloperProps> = ({ onBack, userEmail }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(userEmail || '');
  const [message, setMessage] = useState('');

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="flex flex-col h-full max-w-4xl mx-auto w-full p-4 md:p-8 font-sans"
    >
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors group"
        >
          <div className="p-2 rounded-full group-hover:bg-zinc-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </div>
          <span className="font-medium">Back to Dashboard</span>
        </button>

        <div className="flex items-center gap-4">
          <a href="https://www.linkedin.com/in/yuva-kishore-7104a1293?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app" target="_blank" rel="noopener noreferrer">
            <Linkedin className="w-5 h-5 text-zinc-500 hover:text-white cursor-pointer transition-colors" />
          </a>
        </div>
      </div>

      <section id="contact" className="grid md:grid-cols-2 gap-12 items-start py-8">
        <div className="space-y-8">
          <div>
            <h2 className="text-4xl font-bold text-white tracking-tight mb-4">Get in touch</h2>
            <p className="text-zinc-400 text-lg leading-relaxed">
              Get in touch if you find any bugs and to suggest the future updates
            </p>
          </div>

          <div className="container space-y-6 pt-4">
            <p className="flex items-center gap-4 group">
              <a href="mailto:meruvayuvakishore@gmail.com" className="flex items-center gap-4 text-zinc-300 hover:text-indigo-400 transition-colors bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 w-full group-hover:border-indigo-500/30 transition-all">
                <Mail className="w-5 h-5 text-indigo-400" />
                <span className="font-medium">✉︎__meruvayuvakishore</span>
              </a>
            </p>
            
            <p className="flex items-center gap-4 group">
              <a href="https://www.linkedin.com/in/yuva-kishore-7104a1293?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 text-zinc-300 hover:text-indigo-400 transition-colors bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 w-full group-hover:border-indigo-500/30 transition-all">
                <Linkedin className="w-5 h-5 text-indigo-400" />
                <span className="font-medium">ℹᥒ__linkedin</span>
              </a>
            </p>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-zinc-900/80 border border-indigo-500/20 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden backdrop-blur-xl"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 blur-3xl -mr-16 -mt-16 rounded-full" />
          
          <form action="https://submit-form.com/ay7WwYxVv" method="POST" className="relative z-10 space-y-6">
            <div className="space-y-2">
              <label htmlFor="name" className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Name</label>
              <input 
                type="text" 
                id="name" 
                name="name" 
                placeholder="Name" 
                required 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl px-6 py-4 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Email</label>
              <input 
                type="email" 
                id="email" 
                name="email" 
                placeholder="Email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl px-6 py-4 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="message" className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Message</label>
              <textarea 
                id="message" 
                name="message" 
                rows={4}
                placeholder="Message"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl px-6 py-4 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-medium"
              />
            </div>

            <motion.button 
              type="submit"
              whileHover={{ scale: 1.02, backgroundColor: 'var(--color-indigo-500)' }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 transition-all"
            >
              <Send className="w-5 h-5" />
              <span className="text-lg">Send</span>
            </motion.button>
          </form>
        </motion.div>
      </section>
    </motion.div>
  );
};


