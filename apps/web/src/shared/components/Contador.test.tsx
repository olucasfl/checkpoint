import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Contador } from './Contador';

describe('Contador (CA-49)', () => {
  it('não anima na primeira renderização e anima quando o valor muda (o número novo já está no DOM)', () => {
    const { container, rerender } = render(<Contador valor={3} className="x" />);
    expect(container.firstElementChild).toHaveTextContent('3');
    expect(container.firstElementChild).not.toHaveClass('contador-troca');

    rerender(<Contador valor={4} className="x" />);

    expect(container.firstElementChild).toHaveTextContent('4');
    expect(container.firstElementChild).toHaveClass('contador-troca', 'x');
  });
});
