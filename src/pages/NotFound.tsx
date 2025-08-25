import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
<div className="min-h-screen flex items-center justify-center bg-muted/20">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-destructive">404</h1>
        <p className="text-xl mb-4 text-muted-foreground">Oops! Página não encontrada</p>
        <a href="/" className="text-primary hover:text-primary/80 underline font-medium">
          Voltar ao Dashboard
        </a>
      </div>
    </div>
  );
};

export default NotFound;
