export const Footer = () => {
    return (
        <footer className="py-12 px-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                    © {new Date().getFullYear()} youtick. All rights reserved.
                </div>
                <div className="flex gap-8 text-sm font-medium">
                    <a href="#" className="hover:text-gray-600 dark:hover:text-gray-300">Twitter</a>
                    <a href="#" className="hover:text-gray-600 dark:hover:text-gray-300">GitHub</a>
                    <a href="#" className="hover:text-gray-600 dark:hover:text-gray-300">Discord</a>
                </div>
            </div>
        </footer>
    );
};
