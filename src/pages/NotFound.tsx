import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="text-center">
      <h1 className="mb-2 text-4xl font-bold text-muted-foreground">404</h1>
      <p className="mb-4 text-muted-foreground">Página não encontrada</p>
      <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
        Voltar ao início
      </Link>
    </div>
  </div>
);

export default NotFound;
